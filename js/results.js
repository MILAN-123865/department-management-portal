/**
 * Department Management Portal - Internal Marks & Result Module
 * 
 * Features:
 * - Student view: Component breakdown, rubrics, chart, scorecard modal
 * - Faculty view: Course continuous assessment roster (CS501), live mark entry & grade calculation
 * - Printable academic transcript
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initResultsPage();
  } catch (err) {
    console.error('Failed to initialize results page:', err);
  }
});

let resultsCategoryFilter = 'all';
let resultsSearchQuery = '';
let resultsSortBy = 'percentage_desc';
let resultsChartInstance = null;
let currentActiveUser = null;

async function initResultsPage() {
  currentActiveUser = await window.dataService.getCurrentUser();
  setupEventListeners();
  await refreshResultsView();
}

function setupEventListeners() {
  const searchInput = document.getElementById('resultsSearchInput');
  const clearBtn = document.getElementById('resultsClearSearchBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      resultsSearchQuery = e.target.value;
      if (clearBtn) {
        clearBtn.style.display = resultsSearchQuery.length > 0 ? 'block' : 'none';
      }
      refreshResultsView();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        resultsSearchQuery = '';
        clearBtn.style.display = 'none';
        refreshResultsView();
      }
    });
  }

  const categorySelect = document.getElementById('resultsCategorySelect');
  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      resultsCategoryFilter = e.target.value;
      refreshResultsView();
    });
  }

  const sortSelect = document.getElementById('resultsSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      resultsSortBy = e.target.value;
      refreshResultsView();
    });
  }

  const resetBtn = document.getElementById('resultsResetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resultsSearchQuery = '';
      resultsCategoryFilter = 'all';
      resultsSortBy = 'percentage_desc';
      if (searchInput) searchInput.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      if (categorySelect) categorySelect.value = 'all';
      if (sortSelect) sortSelect.value = 'percentage_desc';
      refreshResultsView();
      window.portalShowToast('Filters Cleared', 'Displaying all records.', 'info');
    });
  }

  const printBtn = document.getElementById('resultsPrintBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.portalPrint();
    });
  }
}

async function refreshResultsView() {
  const isFac = currentActiveUser && currentActiveUser.isFaculty;
  const pageTitle = document.querySelector('.page-title');
  const pageSubtitle = document.querySelector('.page-subtitle');
  const customActions = document.getElementById('resultsCustomActions');

  if (isFac) {
    if (pageTitle) pageTitle.innerHTML = `<i class="bi bi-person-workspace text-primary me-2"></i>Internal Assessment & Grade Entry`;
    if (pageSubtitle) pageSubtitle.innerHTML = `<strong>Instructor View:</strong> ${escapeHtml(currentActiveUser.fullName)} · CS501: Advanced DBMS (Continuous Internal Evaluation)`;

    if (customActions) {
      customActions.innerHTML = `
        <button type="button" class="btn btn-portal-primary btn-portal-sm" onclick="window.portalShowToast('Export Ready', 'Exported CS501 internal assessment records to CSV/Excel format.', 'success')">
          <i class="bi bi-file-earmark-spreadsheet me-1"></i> Export Score Register
        </button>
      `;
    }

    const students = await window.dataService.getEnrolledStudents('CS501');
    renderFacultyResultsSummary(students);
    renderFacultyResultsTable(students);
    renderFacultyResultsChart(students);
  } else {
    if (pageTitle) pageTitle.textContent = 'Internal Marks & Assessment Results';
    if (pageSubtitle) pageSubtitle.textContent = 'Mid-term assessments, continuous evaluations, laboratory vivas & attainment rubrics';

    if (customActions) {
      customActions.innerHTML = '';
    }

    const [summary, records] = await Promise.all([
      window.dataService.getResultsSummary(),
      window.dataService.getResults({
        search: resultsSearchQuery,
        category: resultsCategoryFilter,
        sortBy: resultsSortBy
      })
    ]);

    renderStudentSummaryCards(summary);
    renderStudentResultsTable(records);
    renderStudentResultsChart(records);
  }
}

function renderStudentSummaryCards(summary) {
  const avgEl = document.getElementById('resSummaryAvg');
  const countEl = document.getElementById('resSummaryCount');
  const highestEl = document.getElementById('resSummaryHighest');
  const lowestEl = document.getElementById('resSummaryLowest');
  const totalMarksEl = document.getElementById('resSummaryTotalMarks');

  if (avgEl) avgEl.textContent = `${summary.averagePercentage}%`;
  if (countEl) countEl.textContent = summary.totalEvaluatedSubjects;
  if (totalMarksEl) totalMarksEl.textContent = `${summary.totalObtainedMarks} / ${summary.totalMaxMarks} Total Points`;

  if (highestEl && summary.highestScoringSubject) {
    highestEl.innerHTML = `
      <div class="fw-bold text-success">${escapeHtml(summary.highestScoringSubject.code)}: ${summary.highestScoringSubject.percentage}%</div>
      <div class="text-muted small text-truncate">${escapeHtml(summary.highestScoringSubject.name)} (Grade: ${summary.highestScoringSubject.grade})</div>
    `;
  }

  if (lowestEl && summary.lowestScoringSubject) {
    lowestEl.innerHTML = `
      <div class="fw-bold text-secondary">${escapeHtml(summary.lowestScoringSubject.code)}: ${summary.lowestScoringSubject.percentage}%</div>
      <div class="text-muted small text-truncate">${escapeHtml(summary.lowestScoringSubject.name)} (Grade: ${summary.lowestScoringSubject.grade})</div>
    `;
  }
}

function renderFacultyResultsSummary(students) {
  const avgEl = document.getElementById('resSummaryAvg');
  const countEl = document.getElementById('resSummaryCount');
  const highestEl = document.getElementById('resSummaryHighest');
  const lowestEl = document.getElementById('resSummaryLowest');
  const totalMarksEl = document.getElementById('resSummaryTotalMarks');

  let totalScore = 0;
  let highest = null;
  let lowest = null;

  students.forEach(s => {
    const tot = s.marks.total;
    totalScore += tot;
    if (!highest || tot > highest.marks.total) highest = s;
    if (!lowest || tot < lowest.marks.total) lowest = s;
  });

  const avg = students.length > 0 ? (totalScore / students.length).toFixed(1) : 86.8;

  if (avgEl) avgEl.textContent = `${avg}%`;
  if (countEl) countEl.textContent = `${students.length} Students`;
  if (totalMarksEl) totalMarksEl.textContent = 'CS501 Class Mean Score';

  if (highestEl && highest) {
    highestEl.innerHTML = `
      <div class="fw-bold text-success">${escapeHtml(highest.fullName)}: ${highest.marks.total}%</div>
      <div class="text-muted small text-truncate">Roll #${highest.rollNo} (Grade: ${highest.marks.grade})</div>
    `;
  }

  if (lowestEl && lowest) {
    lowestEl.innerHTML = `
      <div class="fw-bold text-secondary">${escapeHtml(lowest.fullName)}: ${lowest.marks.total}%</div>
      <div class="text-muted small text-truncate">Roll #${lowest.rollNo} (Grade: ${lowest.marks.grade})</div>
    `;
  }
}

function renderStudentResultsTable(records) {
  const tbody = document.getElementById('resultsTableBody');
  const emptyBox = document.getElementById('resultsEmptyBox');
  const countBadge = document.getElementById('resultsRecordCount');

  if (countBadge) countBadge.textContent = `${records.length} Subjects Evaluated`;

  if (!records || records.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (emptyBox) emptyBox.style.display = 'block';
    return;
  }

  if (emptyBox) emptyBox.style.display = 'none';

  tbody.innerHTML = records.map(r => {
    const t1 = r.components.find(c => c.name.includes('Test 1')) || { obtained: '-', max: '-' };
    const t2 = r.components.find(c => c.name.includes('Test 2')) || { obtained: '-', max: '-' };
    const assign = r.components.find(c => c.name.toLowerCase().includes('assign') || c.name.toLowerCase().includes('problem')) || { obtained: '-', max: '-' };
    const prac = r.components.find(c => c.name.toLowerCase().includes('prac') || c.name.toLowerCase().includes('viva') || c.name.toLowerCase().includes('presentation')) || { obtained: '-', max: '-' };

    let categoryBadge = 'badge-primary-subtle';
    if (r.performanceCategory === 'Distinction') categoryBadge = 'badge-success-subtle';
    else if (r.performanceCategory === 'Good') categoryBadge = 'badge-neutral-subtle';

    return `
      <tr>
        <td>
          <span class="fw-bold text-primary font-mono-num">${escapeHtml(r.subjectCode)}</span>
        </td>
        <td>
          <div class="fw-semibold text-dark">${escapeHtml(r.subjectName)}</div>
          <div class="text-muted small">${r.credits} Credits · 5th Semester</div>
        </td>
        <td class="text-num-right font-mono-num small">
          <span class="fw-semibold">${t1.obtained}</span><span class="text-muted">/${t1.max}</span>
        </td>
        <td class="text-num-right font-mono-num small">
          <span class="fw-semibold">${t2.obtained}</span><span class="text-muted">/${t2.max}</span>
        </td>
        <td class="text-num-right font-mono-num small">
          <span class="fw-semibold">${assign.obtained}</span><span class="text-muted">/${assign.max}</span>
        </td>
        <td class="text-num-right font-mono-num small">
          <span class="fw-semibold">${prac.obtained}</span><span class="text-muted">/${prac.max}</span>
        </td>
        <td class="text-num-right font-mono-num fw-bold">
          <span class="text-dark">${r.totalObtained}</span><span class="text-muted">/${r.totalMax}</span>
        </td>
        <td class="text-num-right font-mono-num fw-bold text-primary" style="font-size: 0.9rem;">
          ${r.percentage}%
        </td>
        <td class="text-center">
          <span class="fw-bold text-dark font-mono-num">${escapeHtml(r.grade)}</span>
        </td>
        <td>
          <span class="status-badge ${categoryBadge}">
            ${escapeHtml(r.performanceCategory)}
          </span>
        </td>
        <td class="text-end">
          <button type="button" class="btn btn-portal-secondary btn-portal-sm btn-view-result" data-subject-code="${escapeHtml(r.subjectCode)}" title="View Detailed Report">
            <i class="bi bi-file-earmark-text me-1"></i>Scorecard
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-view-result').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-subject-code');
      const rec = records.find(r => r.subjectCode === code);
      if (rec) openResultModal(rec);
    });
  });
}

function renderFacultyResultsTable(students) {
  const thead = document.querySelector('.portal-table thead tr');
  if (thead) {
    thead.innerHTML = `
      <th style="width: 80px;">Roll No</th>
      <th>Student Full Name</th>
      <th class="text-num-right" style="width: 100px;">Test 1 (25)</th>
      <th class="text-num-right" style="width: 100px;">Test 2 (25)</th>
      <th class="text-num-right" style="width: 110px;">Assign (20)</th>
      <th class="text-num-right" style="width: 110px;">Viva/Lab (30)</th>
      <th class="text-num-right" style="width: 100px;">Total (100)</th>
      <th class="text-center" style="width: 80px;">Grade</th>
      <th class="text-end" style="width: 130px;">Action</th>
    `;
  }

  const tbody = document.getElementById('resultsTableBody');
  const countBadge = document.getElementById('resultsRecordCount');
  if (countBadge) countBadge.textContent = `${students.length} Enrolled Students`;

  let filtered = [...students];
  if (resultsSearchQuery) {
    const q = resultsSearchQuery.toLowerCase();
    filtered = filtered.filter(s => s.fullName.toLowerCase().includes(q) || s.rollNo.includes(q) || s.enrollmentNo.toLowerCase().includes(q));
  }

  tbody.innerHTML = filtered.map(s => {
    const m = s.marks;
    return `
      <tr>
        <td><span class="fw-bold font-mono-num text-primary">#${escapeHtml(s.rollNo)}</span></td>
        <td>
          <div class="fw-semibold text-dark">${escapeHtml(s.fullName)}</div>
          <span class="text-muted small font-mono-num">${escapeHtml(s.enrollmentNo)}</span>
        </td>
        <td class="text-num-right font-mono-num fw-semibold">${m.test1}<span class="text-muted">/25</span></td>
        <td class="text-num-right font-mono-num fw-semibold">${m.test2}<span class="text-muted">/25</span></td>
        <td class="text-num-right font-mono-num fw-semibold">${m.assignments}<span class="text-muted">/20</span></td>
        <td class="text-num-right font-mono-num fw-semibold">${m.practical}<span class="text-muted">/30</span></td>
        <td class="text-num-right font-mono-num fw-bold text-primary" style="font-size: 0.95rem;">${m.total}<span class="text-muted">/100</span></td>
        <td class="text-center"><span class="badge ${m.total >= 90 ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-primary-subtle text-primary border border-primary-subtle'} font-mono-num">${m.grade}</span></td>
        <td class="text-end">
          <button type="button" class="btn btn-portal-secondary btn-portal-sm btn-edit-student-marks" data-student-id="${s.id}">
            <i class="bi bi-pencil-square me-1"></i>Edit Marks
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-edit-student-marks').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-student-id');
      const student = students.find(s => s.id === id);
      if (student) openEditMarksModal(student);
    });
  });
}

function openEditMarksModal(student) {
  let modalEl = document.getElementById('editMarksModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'editMarksModal';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title fs-6 fw-bold">
              <i class="bi bi-pencil-square text-primary me-2"></i>Edit Continuous Assessment Marks
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="editMarksForm">
            <div class="modal-body">
              <div class="p-3 bg-light rounded border mb-3">
                <strong class="d-block text-dark" id="editModalStudentName"></strong>
                <span class="text-muted small" id="editModalStudentMeta"></span>
              </div>
              <input type="hidden" id="editStudentId">
              <div class="row g-2 mb-2">
                <div class="col-6">
                  <label class="form-label small fw-semibold">Internal Test 1 (Max 25)</label>
                  <input type="number" min="0" max="25" class="form-control font-mono-num" id="inputTest1" required>
                </div>
                <div class="col-6">
                  <label class="form-label small fw-semibold">Internal Test 2 (Max 25)</label>
                  <input type="number" min="0" max="25" class="form-control font-mono-num" id="inputTest2" required>
                </div>
              </div>
              <div class="row g-2 mb-3">
                <div class="col-6">
                  <label class="form-label small fw-semibold">Assignments &amp; Quizzes (Max 20)</label>
                  <input type="number" min="0" max="20" class="form-control font-mono-num" id="inputAssign" required>
                </div>
                <div class="col-6">
                  <label class="form-label small fw-semibold">Practical / Viva (Max 30)</label>
                  <input type="number" min="0" max="30" class="form-control font-mono-num" id="inputPractical" required>
                </div>
              </div>
              <div class="p-2 border rounded text-center bg-body-tertiary">
                <span class="small text-muted">Calculated Total: </span>
                <strong class="font-mono-num text-primary fs-6" id="editTotalPreview">0 / 100</strong>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-portal-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-portal-primary btn-sm"><i class="bi bi-check-lg me-1"></i>Save &amp; Update Marks</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    const updatePreview = () => {
      const t1 = Number(document.getElementById('inputTest1').value) || 0;
      const t2 = Number(document.getElementById('inputTest2').value) || 0;
      const as = Number(document.getElementById('inputAssign').value) || 0;
      const pr = Number(document.getElementById('inputPractical').value) || 0;
      document.getElementById('editTotalPreview').textContent = `${t1 + t2 + as + pr} / 100`;
    };

    ['inputTest1', 'inputTest2', 'inputAssign', 'inputPractical'].forEach(id => {
      document.getElementById(id).addEventListener('input', updatePreview);
    });

    modalEl.querySelector('#editMarksForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const sId = document.getElementById('editStudentId').value;
      const test1 = document.getElementById('inputTest1').value;
      const test2 = document.getElementById('inputTest2').value;
      const assignments = document.getElementById('inputAssign').value;
      const practical = document.getElementById('inputPractical').value;

      await window.dataService.updateStudentMarks(sId, 'CS501', { test1, test2, assignments, practical });
      bootstrap.Modal.getInstance(modalEl).hide();
      window.portalShowToast('Marks Updated', `Continuous assessment marks saved for the student.`, 'success');
      await refreshResultsView();
    });
  }

  document.getElementById('editStudentId').value = student.id;
  document.getElementById('editModalStudentName').textContent = student.fullName;
  document.getElementById('editModalStudentMeta').textContent = `Roll #${student.rollNo} · Enrollment: ${student.enrollmentNo} · CS501 Advanced DBMS`;
  document.getElementById('inputTest1').value = student.marks.test1;
  document.getElementById('inputTest2').value = student.marks.test2;
  document.getElementById('inputAssign').value = student.marks.assignments;
  document.getElementById('inputPractical').value = student.marks.practical;
  document.getElementById('editTotalPreview').textContent = `${student.marks.total} / 100`;

  const bsModal = new bootstrap.Modal(modalEl);
  bsModal.show();
}

function renderStudentResultsChart(records) {
  const canvas = document.getElementById('resultsBarChart');
  if (!canvas) return;

  if (resultsChartInstance) {
    resultsChartInstance.destroy();
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const labels = records.map(r => r.subjectCode);
  const data = records.map(r => r.percentage);

  resultsChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Obtained Marks (%)',
        data,
        backgroundColor: '#1d4ed8',
        borderRadius: 4,
        maxBarThickness: 36
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { color: textColor, callback: val => `${val}%` },
          grid: { color: gridColor }
        },
        x: {
          ticks: { color: textColor },
          grid: { display: false }
        }
      }
    }
  });
}

function renderFacultyResultsChart(students) {
  const canvas = document.getElementById('resultsBarChart');
  if (!canvas) return;

  if (resultsChartInstance) {
    resultsChartInstance.destroy();
  }

  const chartTitle = document.querySelector('.portal-card-header h2');
  if (chartTitle) {
    chartTitle.innerHTML = `<i class="bi bi-bar-chart-fill me-2 text-primary"></i>CS501 Enrolled Student Attainment Distribution`;
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const labels = students.map(s => s.fullName.split(' ')[0]);
  const data = students.map(s => s.marks.total);

  resultsChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Attainment (%)',
        data,
        backgroundColor: data.map(val => val >= 90 ? '#059669' : (val >= 80 ? '#2563eb' : '#d97706')),
        borderRadius: 4,
        maxBarThickness: 36
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { color: textColor, callback: val => `${val}%` },
          grid: { color: gridColor }
        },
        x: {
          ticks: { color: textColor },
          grid: { display: false }
        }
      }
    }
  });
}

function openResultModal(record) {
  let modalEl = document.getElementById('scorecardDetailModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'scorecardDetailModal';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title fs-6 fw-bold">
              <i class="bi bi-mortarboard-fill text-primary me-2"></i>
              <span id="scorecardModalTitle">Academic Evaluation Scorecard</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" id="scorecardModalBody"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-portal-primary" onclick="window.print()">
              <i class="bi bi-printer me-1"></i> Print Transcript
            </button>
            <button type="button" class="btn btn-sm btn-portal-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
  }

  document.getElementById('scorecardModalTitle').textContent = `${record.subjectCode} · ${record.subjectName}`;
  const body = document.getElementById('scorecardModalBody');

  body.innerHTML = `
    <div class="row g-2 mb-3 p-3 bg-light rounded border text-center">
      <div class="col-4">
        <span class="text-muted small d-block">Credits</span>
        <strong class="font-mono-num fs-6">${record.credits} Credit Units</strong>
      </div>
      <div class="col-4">
        <span class="text-muted small d-block">Grade Awarded</span>
        <strong class="font-mono-num text-primary fs-6">${escapeHtml(record.grade)}</strong>
      </div>
      <div class="col-4">
        <span class="text-muted small d-block">Total Score</span>
        <strong class="font-mono-num text-success fs-6">${record.totalObtained} / ${record.totalMax} (${record.percentage}%)</strong>
      </div>
    </div>

    <h6 class="fw-bold text-dark mb-2" style="font-size: 0.9rem;">Component Rubric Attainment</h6>
    <div class="table-responsive border rounded mb-3">
      <table class="portal-table table-hover mb-0">
        <thead>
          <tr>
            <th>Evaluation Component</th>
            <th class="text-end" style="width: 120px;">Max Marks</th>
            <th class="text-end" style="width: 140px;">Obtained Marks</th>
            <th class="text-end" style="width: 120px;">Attainment %</th>
          </tr>
        </thead>
        <tbody>
          ${(record.components || []).map(c => `
            <tr>
              <td class="fw-medium text-dark small">${escapeHtml(c.name)}</td>
              <td class="text-end font-mono-num small text-muted">${c.max}</td>
              <td class="text-end font-mono-num small fw-bold text-success">${c.obtained}</td>
              <td class="text-end font-mono-num small">${((c.obtained / c.max) * 100).toFixed(1)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${record.facultyFeedback ? `
      <div class="p-3 border rounded bg-body-tertiary">
        <div class="fw-bold small text-dark mb-1"><i class="bi bi-chat-quote me-1 text-primary"></i>Faculty Appraisal &amp; Remarks:</div>
        <p class="mb-0 text-secondary small fst-italic">"${escapeHtml(record.facultyFeedback)}"</p>
      </div>
    ` : ''}
  `;

  const bsModal = new bootstrap.Modal(modalEl);
  bsModal.show();
}
