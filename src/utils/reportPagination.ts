export function getReportsPerPage(screenWidth: number): number {
  return screenWidth >= 768 ? 6 : 4;
}

export function getPaginationWindow(
  totalItems: number,
  requestedPage: number,
  pageSize: number,
) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage)), totalPages);
  const startIndex = (page - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, totalItems);

  return { page, totalPages, startIndex, endIndex };
}
