import Imap from "imap";
import pem from "pem";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url"; // Needed for __dirname in ESM
import config from "./config.js";
import { simpleParser } from "mailparser";
import { analyzeEmail } from "./analyzeEmail.js";
import { saveLastTimestamp } from "./utilities.js";
import { Readable } from "stream";
import PQueue from "p-queue";

// ---------------------------------------------------------------------
// ESM doesn’t provide __dirname by default. You need to reconstruct it:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ---------------------------------------------------------------------

const queue = new PQueue({ concurrency: 5 });

export async function processEmails(timestamp) {
  return new Promise(async (resolve, reject) => {
    console.log(
      `\n\n[${new Date(timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })} ${new Date(timestamp).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })}]`
    );
    console.log(`*** Checking for unread, non-starred messages.`);

    const certsDir = path.join(__dirname, "certs");
    const certPath = path.join(certsDir, "imap-cert.pem");
    const keyPath = path.join(certsDir, "imap-key.pem");

    // Ensure the certs directory exists
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }

    // Check if the certificate and key already exist; generate if not
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      console.log("Generating new self-signed certificate...");
      await new Promise((resolve, reject) => {
        pem.createCertificate({ days: 365, selfSigned: true }, (err, keys) => {
          if (err) {
            return reject(err);
          }
          fs.writeFileSync(certPath, keys.certificate);
          fs.writeFileSync(keyPath, keys.serviceKey);
          resolve(keys);
        });
      });
    }

    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);

    // Initialize IMAP with TLS configuration
    const imapConfig = {
      user: process.env.IMAP_USER,
      password: process.env.IMAP_PASSWORD,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsOptions: {
        key: key,
        cert: cert,
        rejectUnauthorized: false, // For development only; caution in production
      },
      authTimeout: 300000,
    };

    const imap = new Imap(imapConfig);

    function openInbox(cb) {
      imap.openBox("INBOX", false, cb);
    }

    imap.once("ready", async function () {
      openInbox(async function (err, box) {
        if (err) throw err;

        // Use search criteria to get unread emails since the last timestamp
        imap.search(
          ["UNSEEN", ["SINCE", new Date(timestamp)]],
          async function (err, results) {
            if (err) throw err;

            if (results.length > 0) {
              const fetchOptions = {
                bodies: "",
                struct: true,
                markSeen: false, // Do not mark emails as seen automatically
              };

              const f = imap.fetch(results, fetchOptions);
              let emailPromises = []; // Create an array to hold promises for each email processed
              let i = 0;

              f.on("message", function (msg, seqno) {
                if (i > config.settings.maxEmailsToProcessAtOnce) return;

                const attributesPromise = new Promise((resolve) =>
                  msg.once("attributes", resolve)
                );

                const emailPromise = new Promise((resolve, reject) => {
                  msg.on("body", function (stream, info) {
                    simpleParser(stream)
                      .then(async (email) => {
                        const attributes = await attributesPromise;

                        // Check if the email is flagged as \\Starred; if so, skip it
                        if (!attributes.flags.includes("\\Flagged")) {
                          const emailBodyStream = new Readable();
                          emailBodyStream.push(email.text || email.html);
                          emailBodyStream.push(null);

                          const emailAnalysis = await analyzeEmail(
                            email.subject,
                            email.from.text,
                            emailBodyStream,
                            email.date
                          );

                          if (emailAnalysis.judgment !== "unknown") {
                            // After determining if an email is worth reading or not
                            if (emailAnalysis.judgment === true) {
                              // Flag the message as important
                              if (config.settings.starAllKeptEmails)
                                imap.addFlags(
                                  attributes.uid,
                                  ["\\Flagged"],
                                  function (err) {
                                    if (err)
                                      console.log("Error starring email:", err);
                                  }
                                );
                            } else if (emailAnalysis.judgment === false) {
                              // Mark the message as seen
                              if (config.settings.markAllRejectedEmailsRead)
                                imap.setFlags(
                                  attributes.uid,
                                  ["\\Seen"],
                                  function (err) {
                                    if (err)
                                      console.log(
                                        "Error marking email as seen:",
                                        err
                                      );
                                  }
                                );

                              const folderToMoveTo = config.settings
                                .sortIntoCategoryFolders
                                ? emailAnalysis.category
                                : config.settings.rejectedFolderName;

                              // Move the message to the target folder
                              imap.move(
                                attributes.uid,
                                folderToMoveTo,
                                function (err) {
                                  if (err) {
                                    console.log(
                                      `Error moving email to ${folderToMoveTo}:`,
                                      err
                                    );
                                  } else {
                                    console.log(
                                      `Email moved to ${folderToMoveTo}.`
                                    );
                                  }
                                }
                              );
                            }
                            i++;
                          }
                        }
                        resolve(); // Resolve the promise after processing the email
                      })
                      .catch((err) => {
                        console.error("Error parsing mail:", err);
                        reject(err); // Reject if there's an error
                      });
                  });
                });

                emailPromises.push(queue.add(() => emailPromise)); // Add the promise to the queue
              });

              f.once("end", function () {
                Promise.all(emailPromises)
                  .then(() => {
                    if (i !== 0) {
                      console.log(
                        `*** Finished processing ${i} email(s). Enjoy a breath of fresh air.`
                      );
                    } else {
                      console.log(
                        `*** No unread, non-starred messages found for any date starting ${new Date(
                          timestamp
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}.`
                      );
                    }

                    saveLastTimestamp(
                      new Date().toISOString(),
                      config.settings.timestampFilePath
                    );
                    imap.end(); // Close the IMAP connection only after all emails have been processed
                    resolve({
                      statusCode: 200,
                      message: "Email processing completed.",
                    });
                  })
                  .catch((error) => {
                    console.error("Error processing some emails:", error);
                    imap.end(); // Close IMAP connection, even if errors occur
                    resolve({
                      statusCode: 500,
                      message: "Error processing email.",
                    });
                  });
              });
            } else {
              console.log("No new messages to fetch.");
              imap.end();
            }
          }
        );
      });
    });

    imap.connect();
  });
}
