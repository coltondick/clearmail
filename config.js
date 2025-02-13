import 'dotenv/config';
import fs from 'fs';
import yaml from 'js-yaml';

const configPath = process.env.CONFIG_YML_PATH;

const fileContents = fs.readFileSync(configPath, 'utf8');
const config = yaml.load(fileContents);

export default config;
