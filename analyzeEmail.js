import { executeOpenAIWithRetry, fixJSON } from './utilities.js';
import axios from 'axios';
import config from './config.js';
import natural from 'natural';
import keyword_extractor from 'keyword-extractor';
import ml from 'ml-classify-text';
import stream from 'stream';
import NodeCache from 'node-cache';

const emailCache = new NodeCache({ stdTTL: 3600 }); // Cache expires in 1 hour

export async function analyzeEmail(emailSubject, emailSender, emailBodyStream, emailDate) {
    const categoriesList = `"${config.categoryFolderNames.join('", "')}"`;

    let emailPrompt = `ONLY OUTPUT JSON ALL OUTPUT IS IN JSON.
        JSON FIELD INSTRUCTIONS:
        meets_criteria = [true or false]
        explanation = Explain why the email does or does not meet the criteria defined below in the rules
        category = CHOOSE ONLY ONE OF ["${categoriesList}"]
        
        <email>
        <subject>${emailSubject}</subject> <sender>${emailSender}</sender> <body>{{emailBody}}</body>
        </email>

        <rules>
        "meets_criteria": true IF email is
        ${config.rules.keep}

        "meets_criteria": false IF email is
        ${config.rules.reject}
        </rules>
        
        <email>
        <subject>${emailSubject}</subject> <sender>${emailSender}</sender>
        </email>

        Let's think step by step and take a deep breath.  I will give you a $100,000 reward for ensuring you have correctly classified whether the email meets the criteria according to the rules.  My career depends on it.
        
        Categories CAN ONLY BE ["${categoriesList}"]
        OUTPUT JSON ONLY DO NOT USE MARKDOWN in the following structure: 
        { "meets_criteria": false, "explanation": "insert here", "category": "insert here" }`;

    let analysis = { judgment: 'unknown', category: '', explanation: '' };

    const emailBodyChunks = [];
    for await (const chunk of emailBodyStream) {
        emailBodyChunks.push(chunk);
    }
    const emailBody = Buffer.concat(emailBodyChunks).toString('utf-8');

    const cacheKey = `${emailSubject}-${emailSender}-${emailDate}`;
    const cachedResult = emailCache.get(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

    try {
        let result;

        if (!config.settings.useLocalLLM) {
            const openAIParams = {
                model: config.openAI.model,
                temperature: 1,
                messages: [
                  {
                    'role': 'system',
                    'content': `We are an AI built to test whether an email meets criteria for user ${config.settings.myName}.`,
                  },
                  {
                    'role': 'user',
                    'content': emailPrompt.replace('{{emailBody}}', emailBody.substring(0, config.settings.maxEmailChars))
                  }
                ]
            };
            result = fixJSON(await executeOpenAIWithRetry(openAIParams));
        } else {
            const localParams = {
                messages: [
                  {
                    role: 'system',
                    content: `We are an AI built to test whether an email meets criteria for user ${config.settings.myName}.`
                  },
                  {
                    role: 'user',
                    content: emailPrompt.replace('{{emailBody}}', emailBody.substring(0, config.settings.maxEmailChars))
                  }
                ],
                temperature: 0.7,
                max_tokens: -1,
                stream: false
            };
            const response = await axios.post(config.localLLM.postURL, localParams, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            result = fixJSON(response.data.choices[0].message.content.trim());
        }

        try {
            const parsedResult = JSON.parse(result);
            analysis.judgment = parsedResult.meets_criteria;
            analysis.category = parsedResult.category;
            analysis.explanation = parsedResult.explanation;

            console.log('*************************************************************************************************************************');
            console.log('*************************************************************************************************************************');
            console.log('Sender: ', emailSender);
            console.log('Date: ', emailDate);
            console.log('Subject: ', emailSubject);
            console.log('Body: ', emailBody.substring(0, 100).replace(/\s+/g, ' '));
            console.log('Category: ', analysis.category);
            console.log('Meets Criteria / worth reading: ', analysis.judgment);
            console.log('Explanation: ', analysis.explanation);
            console.log('*************************************************************************************************************************');
            console.log('*************************************************************************************************************************');
        } catch (error) {
            console.log('Error parsing JSON: ', error);
            analysis.judgment = 'unknown';
        }
    } catch (error) {
        console.error('Error determining if email is worth reading:', error);
        analysis.judgment = 'unknown';
    }

    emailCache.set(cacheKey, analysis);
    return analysis;
}
