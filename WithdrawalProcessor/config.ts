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

export const awsS3BucketName = process.env.AWS_S3_BUCKET_NAME as string;

export const policyConfig = {
  maxWithdrawalDays: process.env.MAX_WITHDRAWAL_DAYS ? Number(process.env.MAX_WITHDRAWAL_DAYS) : 90,
};
