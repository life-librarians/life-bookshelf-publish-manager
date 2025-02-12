import { PublishStatus } from './types';

export function stringToPublishStatus(status: string): PublishStatus {
  switch (status) {
    case '새 요청':
      return PublishStatus.REQUESTED;
    case '요청 처리중':
      return PublishStatus.REQUEST_CONFIRMED;
    case '출판중':
      return PublishStatus.IN_PUBLISHING;
    case '출판 완료':
      return PublishStatus.PUBLISHED;
    case '출판 반려':
      return PublishStatus.REJECTED;
    default:
      throw new Error(`Invalid publish status: ${status}`);
  }
}

export function publishStatusToString(status: PublishStatus): string {
  switch (status) {
    case PublishStatus.REQUESTED:
      return '새 요청';
    case PublishStatus.REQUEST_CONFIRMED:
      return '요청 처리중';
    case PublishStatus.IN_PUBLISHING:
      return '출판중';
    case PublishStatus.PUBLISHED:
      return '출판 완료';
    case PublishStatus.REJECTED:
      return '출판 반려';
  }
}

export function getPushNotificationContent(status: PublishStatus): { title: string; body: string } {
  switch (status) {
    case PublishStatus.REQUESTED:
      return {
        title: '출판 요청 접수 알림',
        body: '출판 요청이 접수되었습니다. 처리 완료 후 알림을 드리겠습니다.',
      };
    case PublishStatus.REQUEST_CONFIRMED:
      return {
        title: '출판 요청 확인 알림',
        body: '출판 요청이 정상적으로 확인되었습니다. 출판 준비가 진행됩니다.',
      };
    case PublishStatus.IN_PUBLISHING:
      return {
        title: '출판 진행 알림',
        body: '현재 출판이 진행 중입니다. 완료되면 알림을 드리겠습니다.',
      };
    case PublishStatus.PUBLISHED:
      return {
        title: '출판 완료 알림',
        body: '축하합니다! 출판이 성공적으로 완료되었습니다.',
      };
    case PublishStatus.REJECTED:
      return {
        title: '출판 요청 반려 알림',
        body: '출판 요청이 반려되었습니다. 자세한 내용은 관리자에게 문의하세요.',
      };
    default:
      throw new Error(`Unknown publish status: ${status}`);
  }
}

export function areDatesDifferent(date1: Date | null, date2: Date | null): boolean {
  if (date1 === date2) {
    return false; // 둘 다 null이거나 같은 객체
  }

  if (date1 === null || date2 === null) {
    return true; // 하나만 null인 경우
  }

  return date1.getTime() !== date2.getTime(); // 날짜 값 비교
}
