/* 보험콕검 v0.1 - 서버 전송 없는 브라우저 내부 분석 */
(() => {
  const MAX_FILES = 10;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
  const MAX_PDF_PAGES = 20;

  const state = {
    files: [],
    rows: [],
    fileResults: [],
    pointGroups: {},
    opinion: '',
    extractedTexts: []
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const els = {
    fileInput: $('#fileInput'),
    selectFileButton: $('#selectFileButton'),
    dropzone: $('#dropzone'),
    fileListSection: $('#fileListSection'),
    fileList: $('#fileList'),
    fileTotalText: $('#fileTotalText'),
    runButton: $('#runButton'),
    resetButton: $('#resetButton'),
    progressSection: $('#progressSection'),
    progressText: $('#progressText'),
    progressFill: $('#progressFill'),
    resultsSection: $('#resultsSection'),
    checklistBody: $('#checklistBody'),
    fileAnalysis: $('#fileAnalysis'),
    pointsContent: $('#pointsContent'),
    opinionText: $('#opinionText'),
    okCount: $('#okCount'),
    warnCount: $('#warnCount'),
    missingCount: $('#missingCount'),
    hardCount: $('#hardCount'),
    copyOpinionButton: $('#copyOpinionButton'),
    saveTxtButton: $('#saveTxtButton'),
    downloadCsvButton: $('#downloadCsvButton'),
    copyAllButton: $('#copyAllButton'),
    topButton: $('#topButton'),
    floatingTopButton: $('#floatingTopButton'),
    bottomStatus: $('#bottomStatus'),
    bottomRunButton: $('#bottomRunButton'),
    bottomResetButton: $('#bottomResetButton'),
    inputSummary: $('#inputSummary'),
    inputSummaryText: $('#inputSummaryText')
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  });

  els.selectFileButton.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (event) => addFiles(event.target.files));
  els.runButton.addEventListener('click', runAnalysis);
  els.resetButton.addEventListener('click', resetAll);
  els.copyOpinionButton.addEventListener('click', copyOpinion);
  els.saveTxtButton.addEventListener('click', saveOpinionTxt);
  els.downloadCsvButton.addEventListener('click', downloadCsv);
  els.copyAllButton.addEventListener('click', copyAllResults);
  els.topButton.addEventListener('click', scrollTop);
  els.floatingTopButton.addEventListener('click', scrollTop);
  els.bottomRunButton?.addEventListener('click', runAnalysis);
  els.bottomResetButton?.addEventListener('click', resetAll);
  $$('input[type="checkbox"]').forEach(input => input.addEventListener('change', updateBottomAction));
  updateBottomAction();

  ['dragenter', 'dragover'].forEach(type => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(type => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove('is-dragover');
    });
  });
  els.dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const accepted = [];
    const messages = [];
    const currentNames = new Set(state.files.map(file => `${file.name}-${file.size}`));

    for (const file of incoming) {
      const extOk = /\.(pdf|jpg|jpeg|png)$/i.test(file.name);
      if (!extOk) {
        messages.push(`${file.name}: 지원하지 않는 형식입니다.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        messages.push(`${file.name}: 파일 1개당 10MB 이하를 권장합니다.`);
      }
      if (state.files.length + accepted.length >= MAX_FILES) {
        messages.push('파일은 최대 10개까지 선택할 수 있습니다.');
        break;
      }
      const key = `${file.name}-${file.size}`;
      if (currentNames.has(key)) continue;
      accepted.push(file);
    }

    const nextTotal = [...state.files, ...accepted].reduce((sum, file) => sum + file.size, 0);
    if (nextTotal > MAX_TOTAL_SIZE) {
      alert('전체 파일 용량은 50MB 이하를 권장합니다. 파일 수나 용량을 줄여주세요.');
      return;
    }

    state.files.push(...accepted);
    els.fileInput.value = '';
    renderFileList();
    updateStep(state.files.length ? 3 : 1);

    if (messages.length) alert(messages.join('\n'));
  }

  function renderFileList() {
    els.fileList.innerHTML = '';
    if (!state.files.length) {
      els.fileListSection.classList.add('hidden');
      els.runButton.disabled = true;
    if (els.bottomRunButton) els.bottomRunButton.disabled = true;
      if (els.bottomRunButton) els.bottomRunButton.disabled = true;
      updateBottomAction();
      return;
    }

    els.fileListSection.classList.remove('hidden');
    els.runButton.disabled = false;
    if (els.bottomRunButton) els.bottomRunButton.disabled = false;
    updateBottomAction();
    const totalSize = state.files.reduce((sum, file) => sum + file.size, 0);
    els.fileTotalText.textContent = `총 ${state.files.length}개 파일 · ${formatBytes(totalSize)}`;

    state.files.forEach((file, index) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.innerHTML = `
        <span class="file-name">${index + 1}. ${escapeHtml(file.name)}</span>
        <span class="file-size">${formatBytes(file.size)}</span>
        <button type="button" class="delete-btn" data-index="${index}">삭제</button>
      `;
      els.fileList.appendChild(li);
    });

    $$('.delete-btn').forEach(button => {
      button.addEventListener('click', () => {
        state.files.splice(Number(button.dataset.index), 1);
        renderFileList();
        updateStep(state.files.length ? 3 : 1);
      });
    });
  }

  async function runAnalysis() {
    if (!state.files.length) return;
    updateStep(4);
    showProgress(0, '현재 진행: 분석 준비 중');
    els.progressSection.classList.remove('hidden');
    els.resultsSection.classList.add('hidden');
    els.runButton.disabled = true;
    if (els.bottomRunButton) els.bottomRunButton.disabled = true;

    state.extractedTexts = [];
    state.fileResults = [];

    try {
      for (let i = 0; i < state.files.length; i += 1) {
        const file = state.files[i];
        const baseProgress = Math.round((i / state.files.length) * 100);
        showProgress(baseProgress, `현재 진행: ${i + 1} / ${state.files.length}개 파일 분석 중`);

        let text = '';
        let method = '텍스트 추출';
        let warning = '';

        try {
          if (/\.pdf$/i.test(file.name)) {
            const result = await extractPdfText(file, (page, total) => {
              const current = Math.round(((i + page / Math.max(total, 1)) / state.files.length) * 100);
              showProgress(current, `현재 진행: ${i + 1} / ${state.files.length}개 파일 · PDF ${page}/${total}쪽 처리 중`);
            });
            text = result.text;
            method = result.method;
            warning = result.warning;
          } else {
            method = '이미지 OCR';
            text = await extractImageText(file, (progress) => {
              const current = Math.round(((i + progress) / state.files.length) * 100);
              showProgress(current, `현재 진행: ${i + 1} / ${state.files.length}개 파일 · 이미지 OCR 중`);
            });
          }
        } catch (error) {
          warning = `분석 오류: ${error.message || '알 수 없는 오류'}`;
        }

        const normalized = normalizeText(text);
        state.extractedTexts.push({ file, text: normalized, rawText: text, method, warning });
        state.fileResults.push(buildFileResult(file, normalized, method, warning));
      }

      showProgress(100, '현재 진행: 결과 정리 중');
      const result = buildChecklist(state.extractedTexts);
      state.rows = result.rows;
      state.pointGroups = result.pointGroups;
      state.opinion = buildOpinion(result.rows);
      renderResults();
      updateStep(5);
    } finally {
      els.runButton.disabled = false;
      if (els.bottomRunButton) els.bottomRunButton.disabled = false;
      setTimeout(() => els.progressSection.classList.add('hidden'), 250);
    }
  }

  async function extractPdfText(file, onPage) {
    if (!window.pdfjsLib) throw new Error('PDF 분석 라이브러리를 불러오지 못했습니다.');

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const warning = pdf.numPages > MAX_PDF_PAGES ? `PDF ${pdf.numPages}쪽 중 ${MAX_PDF_PAGES}쪽까지만 분석했습니다.` : '';
    let text = '';

    for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
      onPage?.(pageNo, totalPages);
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      text += `\n--- page ${pageNo} ---\n${pageText}`;
    }

    if (text.trim().length >= 30) {
      return { text, method: 'PDF 텍스트 추출', warning };
    }

    // 텍스트가 거의 없는 PDF는 스캔본으로 보고 OCR을 시도한다.
    let ocrText = '';
    for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
      onPage?.(pageNo, totalPages);
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/png');
      ocrText += `\n--- page ${pageNo} OCR ---\n` + await extractDataUrlText(dataUrl);
    }
    return { text: ocrText, method: 'PDF OCR', warning };
  }

  async function extractImageText(file, onProgress) {
    if (!window.Tesseract) throw new Error('OCR 라이브러리를 불러오지 못했습니다.');
    const dataUrl = await fileToDataUrl(file);
    return extractDataUrlText(dataUrl, onProgress);
  }

  async function extractDataUrlText(dataUrl, onProgress) {
    if (!window.Tesseract) throw new Error('OCR 라이브러리를 불러오지 못했습니다.');
    const result = await window.Tesseract.recognize(dataUrl, 'kor+eng', {
      logger: message => {
        if (message.status === 'recognizing text') onProgress?.(message.progress || 0);
      }
    });
    return result?.data?.text || '';
  }

  function buildFileResult(file, text, method, warning) {
    const hits = [];
    if (hasAny(text, KEYWORDS.fire)) hits.push('화재보험');
    if (hasAny(text, KEYWORDS.business)) hits.push('영업배상책임보험');
    if (hasAny(text, KEYWORDS.product)) hits.push('생산물배상책임보험');
    if (hasAny(text, KEYWORDS.travel)) hits.push('여행자보험');

    const parts = [];
    if (hits.length) parts.push(`${hits.join(' / ')} 관련 문구 확인`);
    if (findPeriods(text).length) parts.push('보험기간 후보 있음');
    if (warning) parts.push(warning);
    if (!text.trim()) parts.push('텍스트를 찾지 못함');

    return {
      fileName: file.name,
      method,
      summary: parts.length ? parts.join(' · ') : '명확한 보험 관련 문구를 찾지 못했습니다.'
    };
  }

  // 한글 서류는 띄어쓰기와 OCR 인식이 흔들리므로, 실제 행정서류 표현을 넓게 잡는다.
  // 파일명은 참고하지 않고, 추출된 본문에서 아래 한글 키워드를 찾는다.
  const KEYWORDS = {
    fire: [
      '화재보험', '화재 보험', '건물화재', '건물 화재', '재산종합보험', '재산 종합 보험',
      '보험목적물', '보험 목적물', '목적물', '건물', '시설', '집기비품'
    ],
    business: [
      '영업배상책임', '영업 배상 책임', '영업배상책임보험', '영업 배상 책임 보험',
      '시설소유관리자배상', '시설 소유 관리자 배상', '시설소유자배상', '시설 소유자 배상',
      '구내치료비', '구내 치료비', '대인배상', '대물배상',
      '배상책임보험', '배상 책임 보험', '배상책임', '배상 책임'
    ],
    product: [
      '생산물배상책임', '생산물 배상 책임', '생산물배상책임보험', '생산물 배상 책임 보험',
      '제조물배상책임', '제조물 배상 책임', '제조물책임', '제조물 책임',
      'PL보험', 'PL 보험', '피엘보험', '피엘 보험'
    ],
    travel: [
      '여행자보험', '여행자 보험', '여행종합보험', '여행 종합 보험', '국내여행보험', '국내 여행 보험',
      '교육여행', '교육 여행', '수학여행', '수련활동', '현장체험학습', '체험학습',
      '여행자보험 가입', '여행자 보험 가입', '교육여행단', '부가조건'
    ],
    policy: [
      '보험증권', '보험 증권', '증권', '증권 사본', '보험계약증권', '보험 계약 증권',
      '보험가입증명', '보험 가입 증명', '가입증명', '가입 증명', '보험가입증명서', '보험 가입증명서'
    ],
    terms: ['보험약관', '보험 약관', '약관', '보통약관', '특별약관', '특약'],
    receipt: ['보험료납부', '보험료 납부', '납부영수증', '납부 영수증', '영수증', '보험료', '납입영수증', '납입 영수증'],
    individualFee: [
      '개별 피보험자', '피보험자별', '피보험자 별', '보험료가 일일이', '보험료가 표시',
      '피보험자의 보험료', '피보험자 보험료', '개별 보험료', '일일이 표시'
    ],
    injuryDeath: ['상해 사망', '상해사망', '상해후유장애', '상해 후유장애', '후유장애', '후유 장애', '사망후유장애', '사망 후유장애'],
    injuryMedical: ['상해 치료', '상해치료', '상해치료실비', '상해 치료실비', '치료실비', '치료 실비', '상해의료', '상해 의료', '의료실비'],
    diseaseDeath: ['질병 사망', '질병사망', '질병후유장애', '질병 후유장애', '질병 사망후유장애', '질병 사망 후유장애'],
    diseaseMedical: ['질병 치료', '질병치료', '질병치료실비', '질병 치료실비', '질병의료', '질병 의료'],
    liability: ['배상책임', '배상 책임', '손해배상', '손해 배상', '배상한도', '보상한도', '보상 한도'],
    belongings: ['휴대품', '휴대 물품', '휴대물품', '휴대품손해', '휴대품 손해', '휴대품손상', '휴대품 손상'],
    period: [
      '보험기간', '보험 기간', '유효기간', '유효 기간', '계약기간', '계약 기간',
      '보험개시', '보험 개시', '보험종기', '보험 종기', '시기', '종기', '만기'
    ],
    amount: [
      '사고당', '사고 당', '1사고당', '1 사고당', '일사고당', '일 사고당',
      '보험금액', '보험 금액', '가입금액', '가입 금액', '보상한도', '보상 한도', '배상한도', '배상 한도', '보장한도', '보장 한도'
    ],
    vendor: ['피보험자', '계약자', '보험계약자', '상호', '업체명', '대표자', '상호명', '법인명', '사업자명'],
    address: ['주소', '소재지', '사업장', '사업장소재지', '사업장 소재지', '보험목적물', '보험 목적물', '소재장소']
  };

  function buildChecklist(extractions) {
    const allText = extractions.map(item => item.text).join('\n');
    const selectedTypes = selectedValues('type');
    const selectedCommon = selectedValues('common');
    const rows = [];
    const pointGroups = {
      '화재보험 관련 문구': collectKeywords(allText, KEYWORDS.fire),
      '배상책임 관련 문구': collectKeywords(allText, [...KEYWORDS.business, ...KEYWORDS.product, ...KEYWORDS.liability]),
      '여행자보험 관련 문구': collectKeywords(allText, [...KEYWORDS.travel, ...KEYWORDS.injuryDeath, ...KEYWORDS.injuryMedical, ...KEYWORDS.diseaseDeath, ...KEYWORDS.diseaseMedical, ...KEYWORDS.belongings]),
      '기간 후보': findPeriods(allText),
      '금액/보상한도 후보': findAmountCandidates(allText),
      '업체명 후보': findVendorCandidates(allText),
      '주소 후보': findAddressCandidates(allText)
    };

    if (selectedTypes.includes('fire')) rows.push(rowFromKeyword('화재보험', allText, KEYWORDS.fire, '화재보험 관련 문구 확인'));
    if (selectedTypes.includes('business')) {
      rows.push(rowFromKeyword('영업배상책임보험', allText, KEYWORDS.business, '영업배상책임보험 관련 문구 확인'));
      rows.push(rowFromKeyword('영업배상책임보험 증권 사본', allText, KEYWORDS.policy, '보험증권 또는 증권 사본 관련 문구 확인'));
      rows.push(rowFromKeyword('사고당 보험금액 문구', allText, KEYWORDS.amount, '사고당 보험금액 또는 보상한도 관련 문구 확인'));
    }
    if (selectedTypes.includes('product')) rows.push(rowFromKeyword('생산물배상책임보험', allText, KEYWORDS.product, '생산물배상책임보험 관련 문구 확인'));
    if (selectedTypes.includes('travel')) {
      rows.push(rowFromKeyword('여행자보험', allText, KEYWORDS.travel, '여행자보험 관련 문구 확인'));
      rows.push(rowFromKeyword('여행자보험 증권', allText, KEYWORDS.policy, '보험증권 또는 가입증명 관련 문구 확인'));
      rows.push(rowFromKeyword('보험 약관', allText, KEYWORDS.terms, '보험 약관 관련 문구 확인'));
      rows.push(rowFromKeyword('보험료 납부 영수증', allText, KEYWORDS.receipt, '보험료 또는 영수증 관련 문구 확인'));
      rows.push(rowFromKeyword('개별 피보험자 보험료 표시', allText, KEYWORDS.individualFee, '개별 피보험자 보험료 관련 문구 확인'));
      rows.push(rowFromKeyword('상해 사망·후유장애 항목', allText, KEYWORDS.injuryDeath, '상해 사망·후유장애 항목 문구 확인'));
      rows.push(rowFromKeyword('상해 치료실비 항목', allText, KEYWORDS.injuryMedical, '상해 치료실비 항목 문구 확인'));
      rows.push(rowFromKeyword('질병 사망·후유장애 항목', allText, KEYWORDS.diseaseDeath, '질병 사망·후유장애 항목 문구 확인'));
      rows.push(rowFromKeyword('질병 치료실비 항목', allText, KEYWORDS.diseaseMedical, '질병 치료실비 항목 문구 확인'));
      rows.push(rowFromKeyword('배상책임 항목', allText, KEYWORDS.liability, '배상책임 항목 문구 확인'));
      rows.push(rowFromKeyword('휴대품 항목', allText, KEYWORDS.belongings, '휴대품 항목 문구 확인'));
    }

    if (selectedCommon.includes('period')) {
      const periods = findPeriods(allText);
      rows.push({ item: '보험기간', status: periods.length ? '확인 필요' : '누락 의심', detail: periods.length ? `기간 후보 있음: ${periods.slice(0, 2).join(', ')}` : '보험기간 또는 유효기간 문구를 찾지 못했습니다.' });
    }
    if (selectedCommon.includes('vendor')) {
      const vendors = findVendorCandidates(allText);
      const basis = $('#vendorName').value.trim();
      rows.push({ item: '업체명 후보', status: vendors.length ? '확인 필요' : '누락 의심', detail: vendors.length ? `업체명 후보: ${vendors.slice(0, 3).join(', ')}${basis ? ` / 기준 업체명: ${basis}` : ''}` : '업체명 후보를 찾지 못했습니다.' });
    }
    if (selectedCommon.includes('address')) {
      const addresses = findAddressCandidates(allText);
      rows.push({ item: '주소 후보', status: addresses.length ? '확인 필요' : '누락 의심', detail: addresses.length ? `주소 후보 있음: ${addresses.slice(0, 2).join(' / ')}` : '명확한 주소 후보를 찾지 못했습니다.' });
    }

    if (extractions.some(item => item.warning || !item.text.trim())) {
      rows.push({ item: '분석 상태', status: '분석 어려움', detail: '일부 파일은 글자 인식이 어렵거나 분석 제한이 있습니다. 원본 확인이 필요합니다.' });
    }

    return { rows, pointGroups };
  }

  function rowFromKeyword(item, text, keywords, successDetail) {
    const hits = collectKeywords(text, keywords);
    if (hits.length) return { item, status: '확인됨', detail: `${successDetail}: ${hits.slice(0, 4).join(', ')}` };
    const similar = weakMatch(item, text);
    if (similar) return { item, status: '확인 필요', detail: '유사 문구가 있어 원본 서류 확인이 필요합니다.' };
    return { item, status: '누락 의심', detail: '해당 항목 관련 문구를 찾지 못했습니다.' };
  }

  function buildOpinion(rows) {
    const confirmed = rows.filter(row => row.status === '확인됨').map(row => row.item);
    const needCheck = rows.filter(row => row.status === '확인 필요').map(row => row.item);
    const missing = rows.filter(row => row.status === '누락 의심').map(row => row.item);
    const hard = rows.filter(row => row.status === '분석 어려움').map(row => row.item);

    const lines = [];
    if (confirmed.length) lines.push(`${confirmed.slice(0, 6).join(', ')} 관련 문구는 확인되었습니다.`);
    if (needCheck.length) lines.push(`${needCheck.slice(0, 6).join(', ')} 항목은 추가 확인이 필요합니다.`);
    if (missing.length) lines.push(`${missing.slice(0, 6).join(', ')} 항목은 업로드 파일에서 명확히 확인되지 않아 누락 의심됩니다.`);
    if (hard.length) lines.push('일부 파일은 글자 인식이 어렵거나 분석 제한이 있어 원본 서류 확인이 필요합니다.');
    lines.push('여행자보험의 보상한도 금액은 학교별 기준에 따라 원본 서류에서 담당자가 직접 확인해 주세요.');
    lines.push('보험콕검 결과는 검토 보조용이며, 최종 판단은 담당자가 원본 서류에서 직접 진행해야 합니다.');
    return lines.join('\n');
  }

  function renderResults() {
    const counts = countStatuses(state.rows);
    els.okCount.textContent = `${counts['확인됨']}건`;
    els.warnCount.textContent = `${counts['확인 필요']}건`;
    els.missingCount.textContent = `${counts['누락 의심']}건`;
    els.hardCount.textContent = `${counts['분석 어려움']}건`;

    els.checklistBody.innerHTML = state.rows.map(row => `
      <tr>
        <td>${escapeHtml(row.item)}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>
    `).join('');

    els.fileAnalysis.innerHTML = state.fileResults.map(result => `
      <div class="analysis-card">
        <strong>${escapeHtml(result.fileName)}</strong>
        <p>└ ${escapeHtml(result.summary)}</p>
      </div>
    `).join('');

    els.pointsContent.innerHTML = Object.entries(state.pointGroups).map(([title, items]) => `
      <div class="point-block">
        <h4>${escapeHtml(title)}</h4>
        ${items.length ? `<ul>${items.slice(0, 8).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="hint">확인된 후보가 없습니다.</p>'}
      </div>
    `).join('');

    els.opinionText.value = state.opinion;
    document.body.classList.add('is-analyzed');
    const typeCount = selectedValues('type').length;
    if (els.inputSummaryText) els.inputSummaryText.textContent = `${typeCount ? typeCount + '개 보험 항목' : '선택 항목 없음'} · 파일 ${state.files.length}개 분석 완료`;
    els.inputSummary?.classList.remove('hidden');
    updateBottomAction();
    els.resultsSection.classList.remove('hidden');
    els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectedValues(name) {
    return $$(`input[name="${name}"]:checked`).map(input => input.value);
  }

  function hasAny(text, keywords) {
    const compact = normalizeText(text).replace(/\s+/g, '');
    return keywords.some(keyword => compact.includes(normalizeText(keyword).replace(/\s+/g, '')));
  }

  function collectKeywords(text, keywords) {
    const compact = normalizeText(text).replace(/\s+/g, '');
    const found = [];
    keywords.forEach(keyword => {
      if (compact.includes(normalizeText(keyword).replace(/\s+/g, ''))) found.push(keyword);
    });
    return [...new Set(found)];
  }

  function weakMatch(item, text) {
    if (!text) return false;
    const compact = normalizeText(text).replace(/\s+/g, '');
    const tokens = normalizeText(item).split(/[·\s]+/).filter(token => token.length >= 2);
    return tokens.some(token => compact.includes(token));
  }

  function findPeriods(text) {
    const patterns = [
      /\d{4}[.\-\/년\s]+\d{1,2}[.\-\/월\s]+\d{1,2}\s*(?:일)?\s*[~∼-]\s*\d{4}[.\-\/년\s]+\d{1,2}[.\-\/월\s]+\d{1,2}/g,
      /\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/g,
      /\d{4}년\s*\d{1,2}월\s*\d{1,2}일/g
    ];
    return uniqueMatches(text, patterns).slice(0, 6);
  }

  function findAmountCandidates(text) {
    const patterns = [
      /(?:사고당|사고\s*당|1\s*사고당|일\s*사고당|보험금액|가입금액|보상한도|배상한도|보장한도)[^\n]{0,40}?(?:\d{1,3}(?:,\d{3})+|\d+)\s*(?:원|만원|천만원|억원)/g,
      /(?:\d{1,3}(?:,\d{3})+|\d+)\s*(?:원|만원|천만원|억원)[^\n]{0,25}?(?:사고당|사고\s*당|보험금액|가입금액|보상한도|배상한도|보장한도)/g,
      /(?:\d+)\s*(?:억|억원|천만원|만원)/g
    ];
    return uniqueMatches(text, patterns).slice(0, 8);
  }

  function findVendorCandidates(text) {
    const lines = text.split(/\n|\r/).map(line => line.trim()).filter(Boolean);
    const candidates = [];
    const patterns = [/피보험자\s*[:：]?\s*([^\n]{2,30})/i, /계약자\s*[:：]?\s*([^\n]{2,30})/i, /상호\s*[:：]?\s*([^\n]{2,30})/i, /업체명\s*[:：]?\s*([^\n]{2,30})/i];
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[1]) candidates.push(cleanCandidate(match[1]));
      }
    }
    return [...new Set(candidates.filter(Boolean))].slice(0, 6);
  }

  function findAddressCandidates(text) {
    const lines = text.split(/\n|\r/).map(line => line.trim()).filter(Boolean);
    const regionPattern = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충청북도|충남|충청남도|전북|전라북도|전남|전라남도|경북|경상북도|경남|경상남도|제주)[^\n]{5,80}/;
    const candidates = [];
    for (const line of lines) {
      if (line.includes('주소') || line.includes('소재지') || line.includes('사업장') || regionPattern.test(line)) {
        candidates.push(cleanCandidate(line));
      }
    }
    return [...new Set(candidates)].slice(0, 6);
  }

  function uniqueMatches(text, patterns) {
    const matches = [];
    for (const pattern of patterns) {
      const found = text.match(pattern);
      if (found) matches.push(...found.map(cleanCandidate));
    }
    return [...new Set(matches)].filter(Boolean);
  }

  function cleanCandidate(value) {
    return String(value).replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
  }

  function normalizeText(text) {
    return String(text || '').replace(/[［\[【]/g, ' ').replace(/[］\]】]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function countStatuses(rows) {
    return rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, { '확인됨': 0, '확인 필요': 0, '누락 의심': 0, '분석 어려움': 0 });
  }

  function statusBadge(status) {
    const cls = status === '확인됨' ? 'ok' : status === '확인 필요' ? 'warn' : status === '누락 의심' ? 'danger' : 'gray';
    return `<span class="status ${cls}">${status}</span>`;
  }

  function showProgress(percent, text) {
    els.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    els.progressText.textContent = text;
  }

  function updateStep(active) {
    const raw = Number(active);
    const current = raw >= 5 ? 3 : raw === 4 ? 2 : 1;
    $$('.step').forEach(step => {
      const stepNo = Number(step.dataset.step);
      step.classList.toggle('is-active', stepNo === current);
      step.classList.toggle('is-done', stepNo < current);
    });
    $$('.status-step').forEach(step => {
      const stepNo = Number(step.dataset.step);
      step.classList.toggle('is-active', stepNo === current);
      step.classList.toggle('is-done', stepNo < current);
    });
    $$('.flow-card').forEach((card, index) => {
      const stepNo = index + 1;
      card.classList.toggle('is-active', stepNo === Math.min(current, 3));
      card.classList.toggle('is-done', stepNo < Math.min(current, 3));
    });
  }

  function updateBottomAction() {
    const selectedCount = $$('input[type="checkbox"]:checked').length;
    if (els.bottomStatus) els.bottomStatus.textContent = `선택 항목 ${selectedCount}개 · 파일 ${state.files.length}개`;
    const disabled = !state.files.length || els.runButton.disabled;
    if (els.bottomRunButton) els.bottomRunButton.disabled = disabled;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** idx).toFixed(idx === 0 ? 0 : 1)}${units[idx]}`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function copyOpinion() {
    navigator.clipboard.writeText(els.opinionText.value).then(() => alert('검토 의견을 복사했습니다.'));
  }

  function saveOpinionTxt() {
    downloadText('boheom-kockgum-opinion.txt', els.opinionText.value, 'text/plain;charset=utf-8');
  }

  function copyAllResults() {
    navigator.clipboard.writeText(buildPlainResult()).then(() => alert('결과 전체를 복사했습니다.'));
  }

  function downloadCsv() {
    const contractName = $('#contractName').value.trim();
    const vendorName = $('#vendorName').value.trim();
    const headers = ['검토일시', '검토유형', '검토항목', '상태', '확인내용', '관련 파일', '참고 문구', '비고'];
    if (contractName || vendorName) {
      headers.splice(2, 0, '계약명', '기준 업체명');
    }
    const now = new Date().toLocaleString('ko-KR');
    const relatedFiles = state.files.map(file => file.name).join(' / ');
    const rows = state.rows.map(row => {
      const base = [now, '보험콕검', row.item, row.status, row.detail, relatedFiles, '', '최종 확인은 담당자 원본 확인'];
      if (contractName || vendorName) base.splice(2, 0, contractName, vendorName);
      return base;
    });
    const csv = toCsv([headers, ...rows]);
    downloadText('boheom-kockgum-checklist.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }

  function buildPlainResult() {
    const lines = ['[보험콕검 결과]', ''];
    state.rows.forEach(row => lines.push(`- ${row.item}: ${row.status} / ${row.detail}`));
    lines.push('', '[검토 의견]', state.opinion);
    return lines.join('\n');
  }

  function toCsv(rows) {
    return rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function resetAll() {
    if (!confirm('입력과 분석 결과를 초기화할까요?')) return;
    state.files = [];
    state.rows = [];
    state.fileResults = [];
    state.pointGroups = {};
    state.opinion = '';
    state.extractedTexts = [];
    els.fileInput.value = '';
    $('#contractName').value = '';
    $('#vendorName').value = '';
    $$('input[type="checkbox"]').forEach(input => input.checked = true);
    renderFileList();
    els.progressSection.classList.add('hidden');
    els.resultsSection.classList.add('hidden');
    els.inputSummary?.classList.add('hidden');
    document.body.classList.remove('is-analyzed');
    updateBottomAction();
    updateStep(1);
    scrollTop();
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
})();
