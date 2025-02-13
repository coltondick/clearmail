# clearmail README

**Notice:** The original project by [**andywalters47**](https://github.com/andywalters47/clearmail) seems to have been abandoned. I have incorporated the enhancements made by [**J-DRD**](https://github.com/J-DRD/clearmail), updated the code to utilize ES modules instead of CommonJS, and added support for running `clearmail` in Docker.

## Introduction

**clearmail** is an open-source project that leverages AI to filter emails according to a set of simple rules you can write in English. The tool stars important emails and rejects or categorizes non-important emails according to preferences you can easily specify.

For maximum peace of mind, clearmail does not delete any emails. Instead, it only adds or removes labels from them, allowing you to review the AI's work. This project began as a weekend project and is still very much a work in progress!

## How it works

### 1. At a Given Interval...

Clearmail operates on a configurable interval, determined by the `refreshInterval` setting in the `config.yml` file. This interval sets how often clearmail checks for new emails. When running in script mode, the process wakes up at this interval, checks for new emails since the last processed timestamp, and then goes back to sleep until the next interval.

### 2. Connecting to the Gmail via IMAP

Clearmail uses the IMAP protocol to connect to your Gmail account. It securely authenticates using the credentials provided in the `.env` file and establishes a connection to the server.

### 3. Searching for New Emails

Once connected, clearmail searches the inbox for any unread emails that have arrived since the last processed timestamp that are not STARRED.

### 4. Processing Each Email

For each new email identified, clearmail performs the following steps:

- **Analyzing the Email:** The email’s sender, subject, and body is analyzed using either the local LLM or OpenAI to determine if the email should be kept/starred or rejected/sorted according to predefined rules you specify in plain English in the `config.yml` file.

#### Sample Rules for Keeping Emails

```yaml
rules:
  keep: |
    * Email is a direct reply to one of my sent emails
    * Email contains tracking information for a recent purchase
    * Subject: "Invoice" or "Receipt" (Transactional emails)
```

#### Example Rules for Rejecting Emails

```yaml
rules:
  reject: |
    * Bulk emails that are not addressed to me specifically by name
    * Subject contains "Subscribe" or "Join now"
    * Email looks like a promotion
```

- **Categorizing or Moving the Email:** If the email is worth reading according to your rules, it is left in the inbox and starred. If it’s not, it’s either:
  - Moved to the rejection folder (as named in `rejectedFolderName`), if the email is considered not important.
  - Moved to a specific label like `Social`, if `sortIntoCategoryFolders` is enabled and the email matches one of the specified categories. You can specify any categories you want! For example:

    ```yaml
    categoryFolderNames:
      - News
      - Social Updates
      - Work
      - Family
      - Financial
    ```

### 5. Wrap Up

If any errors occur during the process, such as connection issues or errors in email analysis, clearmail logs these errors for debugging purposes.

## Requirements

To use clearmail you will need:

- A Gmail account  
- Node.js installed on your system (if running locally and not via Docker)

> **Note**: This has only been tested on macOS.

## Setup Instructions

Follow these steps to get clearmail up and running on your system:

### Step 1: Gmail IMAP Access with App Password

<details>
<summary>How to Create an App Password for Gmail IMAP</summary>

To securely access your Gmail account using IMAP in applications like clearmail, especially when you have 2-Step Verification enabled, you need to create and use an app password. An app password is a 16-character code that allows less secure apps to access your Google Account.

1. **Go to Your Google Account**: [Google Account settings](https://myaccount.google.com/).  
2. **Select Security**: Under "Security," turn on "2-Step Verification."  
3. **Access 2-Step Verification**: You may need to sign in to your account again.  
4. **Open App Passwords**: Scroll to "App passwords." If you don’t see it, ensure 2-Step Verification is enabled.  
5. **Generate a New App Password**: Choose "Mail" and your device, then click "Generate."  
6. **Copy and Use the App Password**: Replace your normal password with this 16-character password in clearmail’s `.env` file.

</details>

### Step 2: Configure the YAML File

Navigate to `config.yml` in the clearmail directory. Customize settings to match your email management preferences.

Example:

```yaml
settings:
  useLocalLLM: false
  maxEmailChars: 2048
  maxEmailsToProcessAtOnce: 20
  refreshInterval: 360
  timestampFilePath: "./lastTimestamp.txt"
  sortIntoCategoryFolders: true
  rejectedFolderName: "AI Rejects"
```

### Step 3: Configure .env File

Rename `.env.example` to `.env` and set values:

```plaintext
OPENAI_API_KEY=your_openai_api_key_here
IMAP_USER=yourname@gmail.com
IMAP_PASSWORD=your_app_password_or_regular_password_here
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
```

### Step 4: Run the Process Locally (Node.js)

1. **Install Node.js** (if not already installed) from [Node.js website](https://nodejs.org/).  
2. **Install dependencies**: `npm install`  
3. **Run clearmail**: `node server.js`

## Running with Docker

If you prefer using Docker, clearmail provides a **`docker-compose.yml`** at the **root** of the repository. Follow these steps:

1. **Install Docker**  
   - If you haven’t already, install Docker Desktop (Windows/Mac) or Docker Engine (Linux). Check [Docker’s official documentation](https://docs.docker.com/get-docker/) for instructions.

2. **Clone the Repository**  
   - If you haven’t already cloned, run:
     ```bash
     git clone https://github.com/coltondick/clearmail.git
     cd clearmail
     ```

3. **Configure `.env`**  
   - At the root of the project, rename `.env.example` to `.env`.
   - Update your IMAP and OpenAI credentials in `.env`.

4. **Edit `config.yml.`**  
   - At the root of the project, rename `config.yml.example` to `config.yml`.
   - Adjust `config.yml` to match your preferences (rules, categories, intervals, etc.).
   - Mount the `config.yml` on `/app/config.yml`. It's important to mount this outside of the workdir of /app/src, otherwise there will be conflicts pulling any updates from git.

5. **Run Docker Compose**  
   - From the root directory (where `docker-compose.yml` is located), run:
     ```bash
     docker-compose up -d
     ```
   - This will build the Docker image, install dependencies, and run clearmail in a container.

6. **Check Logs**  
   - To see clearmail’s logs:
     ```bash
     docker-compose logs -f clearmail
     ```
   - Replace **`clearmail`** with the service name if different.

7. **Stop the Container**  
   - To stop clearmail:
     ```bash
     docker-compose down
     ```
   - This shuts down and removes the container.

### Notes on Docker Usage

- **Mounting Local Files**: You can adjust the `docker-compose.yml` to mount local volumes if you prefer to store certain data or logs on your host system.  
- **Environment Variables**: Additional environment variables can be set in `.env` or directly in `docker-compose.yml`.  
- **Port Mappings**: If `runAsServerOrScript` is set to `server`, in the `config.yml`, you should expose ports by uncommenting the `ports` section in `docker-compose.yml`.

## Large Language Model (LLM) Choice: Local or OpenAI

Clearmail supports integration with a local LLM or an OpenAI model. For local models, we recommend [LM Studio](https://lmstudio.ai/) for quick setup. For OpenAI, see instructions below on how to configure your API key.

### Local Option: Setting Up LM Studio

<details>
<summary>Steps to Configure a Local Inference Server</summary>

1. Download and install LM Studio.  
2. Start an inference server.  
3. Download a language model (e.g., `TheBloke/Mistral-7B-Instruct-v0.2-code-ft-GGUF`).  
4. Update `config.yml`:
    ```yaml
    settings:
      useLocalLLM: true

    localLLM:
      postURL: http://localhost:1234/v1/chat/completions
    ```
</details>

### Using OpenAI

If you prefer OpenAI (e.g., `gpt-3.5-turbo`), ensure `useLocalLLM: false` and set your `OPENAI_API_KEY` in `.env`. You must also have an active OpenAI account.  

## Using PM2 to Manage the clearmail Process (Optional)

For a production-like environment without Docker, [PM2](https://pm2.keymetrics.io/) is helpful to keep clearmail always running:

1. `npm install -g pm2`  
2. `pm2 start server.js --name clearmail`  
3. `pm2 logs clearmail` for logs.  
4. `pm2 stop clearmail` to stop.

## Advanced Email Categorization Rules

Clearmail includes advanced categorization rules using NLP techniques and optional ML-based classification. Customize or disable these features by modifying the relevant sections in `analyzeEmail.js` and `config.yml`.

## Contact

For questions, suggestions, or contributions, please reach out to the project owner, [Andy Walters](mailto:andywalters@gmail.com). 

Project sponsored by [Emerge Haus](https://emerge.haus), a custom Generative AI consultancy & dev shop.

---

**Happy sorting!** Let us know if you have any issues or ideas for improvement.