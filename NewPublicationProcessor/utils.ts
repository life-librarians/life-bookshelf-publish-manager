import { awsS3BucketName } from './config';
import { PublishStatus } from './types';

export function publishStatusToKorean(status: PublishStatus): string {
  switch (status) {
    case PublishStatus.REQUESTED:
      return '새 요청';
    case PublishStatus.REQUEST_CONFIRMED:
      return '요청 처리중';
    case PublishStatus.IN_PUBLISHING:
      return '출판 중';
    case PublishStatus.PUBLISHED:
      return '출판 완료';
    case PublishStatus.REJECTED:
      return '출판 반려';
  }
}

export async function getFullImageUrl(objectKey: string): Promise<string | null> {
  const s3Url = 's3.ap-northeast-2.amazonaws.com';
  const bucketName = awsS3BucketName;
  const url = `https://${s3Url}/${bucketName}/${objectKey}`;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.status === 200) {
      return url; // Image exists and is accessible
    }
    return null; // Image does not exist or is not accessible
  } catch (error) {
    return null; // Network error or other issue
  }
}
