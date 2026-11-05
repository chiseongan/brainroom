// 운영자 정보. 비어 있으면 안내 문서에 '입력 필요'로 보인다 (공개 전에 반드시 채운다).
// reviewed: 법률 전문가나 담당자가 문서를 확인했으면 true. false면 문서 위에 '초안' 표시가 뜬다.
const LEGAL = {
  operator: '',        // 운영자 이름 (개인·팀·단체)
  privacyOfficer: '',  // 개인정보 보호책임자 이름
  contactEmail: '',    // 문의·삭제 요청을 받을 이메일
  address: '',         // 사업자라면 주소 (개인이면 비워도 됨)
  businessNumber: '',  // 사업자등록번호 (있으면)
  effectiveDate: '',   // 시행일 (예: 2026-12-01)
  reviewed: false,
};
