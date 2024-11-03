export enum PublishStatus {
  REQUESTED = 'REQUESTED',
  REQUEST_CONFIRMED = 'REQUEST_CONFIRMED',
  IN_PUBLISHING = 'IN_PUBLISHING',
  PUBLISHED = 'PUBLISHED',
  REJECTED = 'REJECTED',
}

export interface MemberBookPublication {
  publicationId: number;
  bookId: number;
  memberId: number;
  memberName: string;
  memberEmail: string;
  bookTitle: string;
  bookPageCount: number;
  bookCoverImageUrl: string;
  publicationPrice: number;
  publicationRequestedAt: Date;
  willPublishedAt: Date;
  publishStatus: PublishStatus;
  publishedAt: Date | null; // Nullable if not published
}

export interface BookContent {
  pageContent: string;
  pageNumber: number;
}

export interface BookChapter {
  chapterName: string;
  chapterNumber: number;
  contents: BookContent[];
}

export interface NotionDatabaseProperties {
  '출판 ID': { number: number };
  고객명: { title: [{ text: { content: string } }] };
  '고객 이메일': { email: string };
  '책 제목': { rich_text: [{ text: { content: string } }] };
  '페이지 수': { number: number };
  '책 커버 이미지 주소': { url: string };
  '가격(원)': { number: number };
  '출판 요청일': { date: { start: string } };
  '예상 출판일': { date: { start: string } };
  '출판 상태': { select: { name: string } };
}

export interface PublicationNotice {
  publicationId: number;
  memberId: number;
  memberName: string;
  bookTitle: string;
  bookCoverImageUrl: string;
  publishStatus: PublishStatus;
  deviceToken: string;
}

export interface NoticeHistoryRequest {
  memberId: number;
  title: string;
  content: string;
}
