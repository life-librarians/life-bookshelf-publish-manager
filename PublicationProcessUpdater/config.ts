export const databaseConfig = {
  host: process.env.MARIADB_HOST,
  port: Number(process.env.MARIADB_PORT),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
};

export const discordConfig = {
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
};

export const notionConfig = {
  apiKey: process.env.NOTION_API_KEY,
  databaseId: process.env.NOTION_DATABASE_ID as string,
};

export const firebaseAdminKey = process.env.FIREBASE_ADMIN_KEY as string;

export const awsS3BucketName = process.env.AWS_S3_BUCKET_NAME as string;
