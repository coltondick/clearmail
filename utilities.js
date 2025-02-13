import { OpenAI } from 'openai';
import { promises as fs } from 'fs';
import NodeCache from 'node-cache';

const emailCache = new NodeCache({ stdTTL: 3600 }); // Cache expiration time set to 1 hour

export async function executeOpenAIWithRetry(
  params, 
  retries = 3, 
  backoff = 2500, 
  rateLimitRetry = 10, 
  timeoutOverride = 27500
) {
  const RATE_LIMIT_RETRY_DURATION = 61000; // 61 seconds
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let attempts = 0;
  let rateLimitAttempts = 0;
  let error;
  let result;

  while (attempts < retries) {
    try {
      result = await Promise.race([
        openai.chat.completions.create(params),
        new Promise((_, reject) =>
          setTimeout(() => reject(
            new Error(`Request took longer than ${timeoutOverride / 1000} seconds`)
          ), timeoutOverride)
        )
      ]);

      return result.choices[0].message.content.trim();
    } catch (e) {
      error = e;
      attempts++;

      if (e.response && e.response.status === 429 && rateLimitAttempts < rateLimitRetry) {
        console.log(`Hit rate limit. Sleeping for 61s...`);
        await sleep(RATE_LIMIT_RETRY_DURATION);
        rateLimitAttempts++;
        continue;
      }

      const delay = (Math.pow(2, attempts) * backoff) + (backoff * Math.random());
      console.log(`Attempt ${attempts} failed with error: ${e.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw error;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function fixJSON(input) {
  return input
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/`/g, "'")
    .replace(/\\_/g, "_")
    .replaceAll("'''json\n", '')
    .replaceAll("'''", '');
}

export async function getLastTimestamp(timestampFilePath) {
  try {
    const lastTimestamp = await fs.readFile(timestampFilePath, 'utf8');
    return lastTimestamp;
  } catch (error) {
    return new Date().toISOString();
  }
}

export async function saveLastTimestamp(timestamp, timestampFilePath) {
  await fs.writeFile(timestampFilePath, timestamp, 'utf8');
}

export function getCachedResult(cacheKey) {
  return emailCache.get(cacheKey);
}

export function setCachedResult(cacheKey, result) {
  emailCache.set(cacheKey, result);
}
