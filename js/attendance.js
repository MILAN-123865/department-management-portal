/**
 * Department Management Portal - Attendance Tracker Module
 * 
 * Features:
 * - Student view: Subject-wise breakdown, consecutive classes calculator, grievance submission
 * - Faculty view: Course attendance register (CS501), class roster, interactive roll-call modal
 * - Dynamic search & status filtering
 * - Drill-down session logs
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initAttendancePage();
  } catch (err) {
    console.error('Failed to initialize attendance page:', err);
  }
});

let attendanceFilterStatus = 'all';
let attendanceSearchQuery = '';
let attendanceSortBy = 'percentage_desc';
let currentActiveUser = null;

async function initAttendancePage() {
  currentActiveUser = await window.dataService.getCurrentUser();

  // Check URL query parameters (e.g. ?filter=below)
  const urlParams = new URLSearchParams(window.location.search);
  const requestedFilter = urlParams.get('filter');
  if (requestedFilter === 'below') {
    attendanceFilterStatus = 'Below Threshold';
    const statusSelect = document.getElementById('attendanceStatusSelect');
    if (statusSelect) statusSelect.value = 'Below Threshold';
  }

  setupEventListeners();
  await refreshAttendanceView();
}

function setupEventListeners() {
  const searchInput = document.getElementById('attendanceSearchInput');
  const clearBtn = document.getElementById('attendanceClearSearchBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      attendanceSearchQuery = e.target.value;
      if (clearBtn) {
        clearBtn.style.display = attendanceSearchQuery.length > 0 ? 'block' : 'none';
      }
      refreshAttendanceView();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        attendanceSearchQuery = '';
        clearBtn.style.display = 'none';
        refreshAttendanceView();
      }
    });
  }

  const statusSelect = document.getElementById('attendanceStatusSelect');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      attendanceFilterStatus = e.target.value;
      refreshAttendanceView();
    });
  }

  const sortSelect = document.getElementById('attendanceSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      attendanceSortBy = e.target.value;
      refreshAttendanceView();
    });
  }

  const resetBtn = document.getElementById('attendanceResetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      attendanceSearchQuery = '';
      attendanceFilterStatus = 'all';
      attendanceSortBy = 'percentage_desc';
      if (searchInput) searchInput.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      if (statusSelect) statusSelect.value = 'all';
      if (sortSelect) sortSelect.value = 'percentage_desc';
      refreshAttendanceView();
      window.portalShowToast('Filters Cleared', 'Displaying all attendance records.', 'info');
    });
  }

  const printBtn = document.getElementById('attendancePrintBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.portalPrint();
    });
  }
}

async function refreshAttendanceView() {
  const isFac = currentActiveUser && currentActiveUser.isFaculty;
  const actionArea = document.getElementById('attendanceActionArea');
  const pageTitle = document.querySelector('.page-title');
  const pageSubtitle = document.querySelector('.page-subtitle');

  if (isFac) {
    if (pageTitle) pageTitle.innerHTML = `<i class="bi bi-person-workspace text-primary me-2"></i>Course Attendance Register`;
    if (pageSubtitle) pageSubtitle.innerHTML = `<strong>Instructor View:</strong> ${escapeHtml(currentActiveUser.fullName)} · CS501: Advanced Database Management Systems (Section CS-A)`;

    if (actionArea) {
      actionArea.innerHTML = `
        <button type="button" class="btn btn-portal-primary btn-portal-sm" id="btnTakeAttendanceModal">
          <i class="bi bi-check-all me-1"></i> Take Today's Roll Call
        </button>
      `;
      document.getElementById('btnTakeAttendanceModal')?.addEventListener('click', openRollCallModal);
    }

    const students = await window.dataService.getEnrolledStudents('CS501');
    renderFacultySummaryCards(students);
    renderFacultyAttendanceTable(students);
  } else {
    if (pageTitle) pageTitle.textContent = 'Attendance Tracker';
    if (pageSubtitle) pageSubtitle.textContent = 'Curricular attendance breakdown, minimum threshold compliance & session auditing';

    if (actionArea) {
      actionArea.innerHTML = `
        <button type="button" class="btn btn-portal-primary btn-portal-sm" id="btnLeaveGrievanceModal">
          <i class="bi bi-file-earmark-medical me-1"></i> Apply for Medical Leave / Clarification
        </button>
      `;
      document.getElementById('btnLeaveGrievanceModal')?.addEventListener('click', openGrievanceModal);
    }

    const [summary, records] = await Promise.all([
      window.dataService.getAttendanceSummary(),
      window.dataService.getAttendance({
        search: attendanceSearchQuery,
        status: attendanceFilterStatus,
        sortBy: attendanceSortBy
      })
    ]);

    renderStudentSummaryCards(summary);
    renderLowAttendanceAlert(summary, records);
    renderStudentAttendanceTable(records, summary.threshold);
    renderStudentGrievances();
  }
}

function renderStudentSummaryCards(summary) {
  const overallEl = document.getElementById('attSummaryOverall');
  const conductedEl = document.getElementById('attSummaryConducted');
  const attendedEl = document.getElementById('attSummaryAttended');
  const missedEl = document.getElementById('attSummaryMissed');
  const belowThresholdEl = document.getElementById('attSummaryBelow');
  const thresholdBadgeEl = document.getElementById('attThresholdBadge');

  if (overallEl) overallEl.textContent = `${summary.overallPercentage}%`;
  if (conductedEl) conductedEl.textContent = summary.totalClasses;
  if (attendedEl) attendedEl.textContent = summary.attendedClasses;
  if (missedEl) missedEl.textContent = summary.missedClasses;
  if (belowThresholdEl) belowThresholdEl.textContent = summary.belowThresholdCount;
  if (thresholdBadgeEl) thresholdBadgeEl.textContent = `Target Benchmark: ${summary.threshold}%`;
}

function renderFacultySummaryCards(students) {
  const overallEl = document.getElementById('attSummaryOverall');
  const conductedEl = document.getElementById('attSummaryConducted');
  const attendedEl = document.getElementById('attSummaryAttended');
  const missedEl = document.getElementById('attSummaryMissed');
  const belowThresholdEl = document.getElementById('attSummaryBelow');
  const thresholdBadgeEl = document.getElementById('attThresholdBadge');

  let totalAtt = 0;
  let totalClasses = 0;
  let belowCount = 0;

  students.forEach(s => {
    totalAtt += s.attendance.attended;
    totalClasses += s.attendance.total;
    if (s.attendance.percentage < 75) belowCount++;
  });

  const avg = totalClasses > 0 ? ((totalAtt / totalClasses) * 100).toFixed(1) : '88.9';

  if (overallEl) overallEl.textContent = `${avg}%`;
  if (conductedEl) conductedEl.textContent = students[0]?.attendance.total || 36;
  if (attendedEl) attendedEl.textContent = `${students.length} Enrolled`;
  if (missedEl) missedEl.textContent = 'CS501 (Sec A)';
  if (belowThresholdEl) belowThresholdEl.textContent = belowCount;
  if (thresholdBadgeEl) thresholdBadgeEl.textContent = 'Class Average';

  const alertContainer = document.getElementById('attendanceAlertContainer');
  if (alertContainer) {
    if (belowCount > 0) {
      alertContainer.innerHTML = `
        <div class="alert alert-warning border border-warning-subtle d-flex flex-wrap align-items-center justify-content-between p-3 mb-4 rounded-3 shadow-sm" style="background-color: var(--surface-card);">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-exclamation-circle-fill text-warning fs-5"></i>
            <div>
              <strong class="text-dark">Faculty Attendance Notice:</strong>
              <span class="text-secondary small ms-1">${belowCount} students in Section CS-A currently have attendance below the 75% institutional requirement.</span>
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-outline-warning text-dark mt-2 mt-md-0" onclick="document.getElementById('attendanceStatusSelect').value='Below Threshold'; document.getElementById('attendanceStatusSelect').dispatchEvent(new Event('change'));">
            Filter Low Attendance Students
          </button>
        </div>
      `;
    } else {
      alertContainer.innerHTML = '';
    }
  }
}

function renderLowAttendanceAlert(summary, allRecords) {
  const alertContainer = document.getElementById('attendanceAlertContainer');
  if (!alertContainer) return;

  const lowSubjects = allRecords.filter(r => r.percentage < summary.threshold);

  if (lowSubjects.length === 0) {
    alertContainer.innerHTML = '';
    return;
  }

  alertContainer.innerHTML = `
    <div class="alert alert-warning border border-warning-subtle d-flex flex-wrap align-items-center justify-content-between p-3 mb-4 rounded-3 shadow-sm">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-exclamation-triangle-fill text-warning fs-5"></i>
        <div>
          <span class="fw-bold text-dark">Attendance Warning (${lowSubjects.length} Subject${lowSubjects.length > 1 ? 's' : ''} Below ${summary.threshold}%):</span>
          <div class="text-secondary small mt-0">
            ${lowSubjects.map(s => `<strong>${escapeHtml(s.subjectCode)}</strong> (${s.percentage}%) requires ${s.classesNeeded} additional consecutive attended class${s.classesNeeded === 1 ? '' : 'es'}`).join('; ')}.
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-outline-warning text-dark mt-2 mt-md-0" onclick="document.getElementById('attendanceStatusSelect').value='Below Threshold'; document.getElementById('attendanceStatusSelect').dispatchEvent(new Event('change'));">
        Filter Low Attendance
      </button>
    </div>
  `;
}

function renderStudentAttendanceTable(records, threshold) {
  const tbody = document.getElementById('attendanceTableBody');
  const emptyBox = document.getElementById('attendanceEmptyBox');
  const countBadge = document.getElementById('attendanceRecordsCount');

  if (countBadge) countBadge.textContent = `${records.length} Subjects`;

  if (!records || records.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (emptyBox) emptyBox.style.display = 'block';
    return;
  }

  if (emptyBox) emptyBox.style.display = 'none';

  tbody.innerHTML = records.map(r => {
    let progressBarClass = 'progress-good';
    if (r.percentage < threshold) progressBarClass = 'progress-danger';
    else if (r.percentage < threshold + 5) progressBarClass = 'progress-attention';

    let consecutiveNotice = '';
    if (r.percentage < threshold) {
      consecutiveNotice = `<div class="text-danger small mt-1 font-mono-num" style="font-size: 0.72rem;">
        <i class="bi bi-arrow-up-right me-1"></i>Need +${r.classesNeeded} consecutive to reach ${threshold}%
      </div>`;
    } else {
      consecutiveNotice = `<div class="text-success small mt-1" style="font-size: 0.72rem;">
        <i class="bi bi-shield-check me-1"></i>Benchmark satisfied
      </div>`;
    }

    return `
      <tr>
        <td>
          <span class="fw-bold text-primary font-mono-num">${escapeHtml(r.subjectCode)}</span>
        </td>
        <td>
          <div class="fw-semibold text-dark">${escapeHtml(r.subjectName)}</div>
          ${consecutiveNotice}
        </td>
        <td class="text-num-right font-mono-num fw-semibold">${r.totalClasses}</td>
        <td class="text-num-right font-mono-num text-success fw-bold">${r.attendedClasses}</td>
        <td class="text-num-right font-mono-num text-danger fw-bold">${r.missedClasses}</td>
        <td style="min-width: 170px;">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <span class="fw-bold tabular-nums" style="font-size: 0.85rem;">${r.percentage}%</span>
            <span class="text-muted small">Target: ${threshold}%</span>
          </div>
          <div class="portal-progress">
            <div class="portal-progress-bar ${progressBarClass}" style="width: ${Math.min(100, r.percentage)}%;"></div>
          </div>
        </td>
        <td>
          <span class="status-badge ${r.badgeClass}">
            ${escapeHtml(r.status)}
          </span>
        </td>
        <td class="text-end">
          <button type="button" class="btn btn-portal-secondary btn-portal-sm btn-view-sessions" data-subject-code="${escapeHtml(r.subjectCode)}" title="View Session History">
            <i class="bi bi-clock-history me-1"></i>History
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-view-sessions').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-subject-code');
      const rec = records.find(r => r.subjectCode === code);
      if (rec) openSessionHistoryModal(rec, threshold);
    });
  });
}

function renderFacultyAttendanceTable(students) {
  const thead = document.querySelector('.portal-table thead tr');
  if (thead) {
    thead.innerHTML = `
      <th style="width: 90px;">Roll No</th>
      <th>Student Full Name</th>
      <th class="text-num-right" style="width: 110px;">Attended</th>
      <th class="text-num-right" style="width: 90px;">Total</th>
      <th style="width: 190px;">Attendance Compliance</th>
      <th style="width: 140px;">Status</th>
      <th class="text-end" style="width: 140px;">Actions</th>
    `;
  }

  const tbody = document.getElementById('attendanceTableBody');
  const countBadge = document.getElementById('attendanceRecordsCount');
  if (countBadge) countBadge.textContent = `${students.length} Enrolled Students`;

  let filtered = [...students];
  if (attendanceSearchQuery) {
    const q = attendanceSearchQuery.toLowerCase();
    filtered = filtered.filter(s => s.fullName.toLowerCase().includes(q) || s.rollNo.includes(q) || s.enrollmentNo.toLowerCase().includes(q));
  }
  if (attendanceFilterStatus !== 'all') {
    filtered = filtered.filter(s => s.attendance.status.toLowerCase() === attendanceFilterStatus.toLowerCase());
  }

  tbody.innerHTML = filtered.map(s => {
    const att = s.attendance;
    let badgeClass = 'badge-success-subtle';
    let progressClass = 'progress-good';
    if (att.percentage < 75) {
      badgeClass = 'badge-danger-subtle';
      progressClass = 'progress-danger';
    } else if (att.percentage < 80) {
      badgeClass = 'badge-warning-subtle';
      progressClass = 'progress-attention';
    }

    return `
      <tr>
        <td>
          <span class="fw-bold font-mono-num text-primary">#${escapeHtml(s.rollNo)}</span>
        </td>
        <td>
          <div class="fw-semibold text-dark">${escapeHtml(s.fullName)}</div>
          <span class="text-muted small font-mono-num">${escapeHtml(s.enrollmentNo)}</span>
        </td>
        <td class="text-num-right font-mono-num text-success fw-bold">${att.attended}</td>
        <td class="text-num-right font-mono-num text-muted">${att.total}</td>
        <td style="min-width: 170px;">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <span class="fw-bold tabular-nums" style="font-size: 0.85rem;">${att.percentage}%</span>
            <span class="text-muted small">Benchmark: 75%</span>
          </div>
          <div class="portal-progress">
            <div class="portal-progress-bar ${progressClass}" style="width: ${Math.min(100, att.percentage)}%;"></div>
          </div>
        </td>
        <td>
          <span class="status-badge ${badgeClass}">${escapeHtml(att.status)}</span>
        </td>
        <td class="text-end">
          <button type="button" class="btn btn-portal-secondary btn-portal-sm" onclick="window.portalShowToast('Student History', 'CS501 attendance records for ${escapeHtml(s.fullName)} are verified.', 'info')">
            <i class="bi bi-clock-history me-1"></i>Logs
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openRollCallModal() {
  window.dataService.getEnrolledStudents('CS501').then(students => {
    let modalEl = document.getElementById('rollCallModal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'rollCallModal';
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title fs-6 fw-bold">
                <i class="bi bi-check2-square text-primary me-2"></i>Daily Roll Call: CS501 Advanced DBMS
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <form id="rollCallForm">
              <div class="modal-body">
                <div class="row g-2 mb-3">
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Session Date</label>
                    <input type="date" class="form-control form-control-sm" id="rollCallDate" value="${new Date().toISOString().slice(0, 10)}" required>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label small fw-semibold">Class Topic / Lab Module</label>
                    <input type="text" class="form-control form-control-sm" id="rollCallTopic" placeholder="e.g. Distributed Consensus & 2PC Protocols" required>
                  </div>
                </div>

                <div class="d-flex align-items-center justify-content-between mb-2">
                  <span class="small fw-bold text-dark">Student Roster (${students.length} Students)</span>
                  <div class="d-flex gap-2">
                    <button type="button" class="btn btn-sm btn-outline-success py-0 px-2" id="btnMarkAllPresent" style="font-size: 0.72rem;">Mark All Present</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2" id="btnMarkAllAbsent" style="font-size: 0.72rem;">Mark All Absent</button>
                  </div>
                </div>

                <div class="table-responsive border rounded" style="max-height: 320px; overflow-y: auto;">
                  <table class="portal-table table-sm mb-0">
                    <thead style="position: sticky; top: 0; z-index: 2;">
                      <tr>
                        <th style="width: 70px;">Roll</th>
                        <th>Student Name</th>
                        <th>Enrollment No</th>
                        <th class="text-end" style="width: 150px;">Attendance Status</th>
                      </tr>
                    </thead>
                    <tbody id="rollCallTableBody">
                      ${students.map(s => `
                        <tr>
                          <td class="font-mono-num fw-bold">#${s.rollNo}</td>
                          <td class="fw-semibold text-dark">${escapeHtml(s.fullName)}</td>
                          <td class="text-muted small font-mono-num">${escapeHtml(s.enrollmentNo)}</td>
                          <td class="text-end">
                            <div class="btn-group btn-group-sm" role="group">
                              <input type="radio" class="btn-check" name="att_${s.id}" id="pres_${s.id}" value="Present" checked>
                              <label class="btn btn-outline-success py-0 px-2" for="pres_${s.id}">Present</label>
                              <input type="radio" class="btn-check" name="att_${s.id}" id="abs_${s.id}" value="Absent">
                              <label class="btn btn-outline-danger py-0 px-2" for="abs_${s.id}">Absent</label>
                            </div>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-portal-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-portal-primary btn-sm"><i class="bi bi-save me-1"></i>Submit Attendance</button>
              </div>
            </form>
          </div>
        </div>
      `;
      document.body.appendChild(modalEl);

      document.getElementById('btnMarkAllPresent')?.addEventListener('click', () => {
        modalEl.querySelectorAll('input[value="Present"]').forEach(r => r.checked = true);
      });
      document.getElementById('btnMarkAllAbsent')?.addEventListener('click', () => {
        modalEl.querySelectorAll('input[value="Absent"]').forEach(r => r.checked = true);
      });

      modalEl.querySelector('#rollCallForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('rollCallDate').value;
        const topic = document.getElementById('rollCallTopic').value.trim();
        const map = {};
        students.forEach(s => {
          const checked = modalEl.querySelector(`input[name="att_${s.id}"]:checked`);
          map[s.id] = checked ? checked.value : 'Present';
        });

        const res = await window.dataService.recordAttendanceSession('CS501', date, map);
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();

        window.portalShowToast('Attendance Recorded', `Successfully recorded roll call: ${res.presentCount} present, ${res.absentCount} absent.`, 'success');
        await refreshAttendanceView();
      });
    }

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
  });
}

function openGrievanceModal() {
  let modalEl = document.getElementById('grievanceModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'grievanceModal';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title fs-6 fw-bold">
              <i class="bi bi-file-earmark-medical text-primary me-2"></i>Attendance Clarification / Leave Request
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="grievanceForm">
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label small fw-semibold">Subject / Course</label>
                <select class="form-select" id="grvSubject" required>
                  <option value="CS503 - Design & Analysis of Algorithms">CS503 - Design & Analysis of Algorithms</option>
                  <option value="CS501 - Advanced Database Management Systems">CS501 - Advanced Database Management Systems</option>
                  <option value="CS502 - Operating Systems & Kernel Architecture">CS502 - Operating Systems & Kernel Architecture</option>
                  <option value="CS504 - Computer Networks & Protocols">CS504 - Computer Networks & Protocols</option>
                  <option value="CS505 - Software Engineering & Agile Methods">CS505 - Software Engineering & Agile Methods</option>
                  <option value="CS506 - Cloud Computing & Distributed Systems">CS506 - Cloud Computing & Distributed Systems</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label small fw-semibold">Date of Missed Class</label>
                <input type="date" class="form-control" id="grvDate" value="2026-10-18" required>
              </div>
              <div class="mb-3">
                <label class="form-label small fw-semibold">Reason / Clarification</label>
                <textarea class="form-control" id="grvReason" rows="3" placeholder="Provide details regarding medical leave, collegiate event, or attendance discrepancy..." required></textarea>
              </div>
              <div class="text-muted" style="font-size: 0.72rem;">
                * Submissions are routed to your Faculty Advisor (Dr. Sunita Sharma) and the Dean of Academics for digital sign-off.
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-portal-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-portal-primary btn-sm"><i class="bi bi-send me-1"></i>Submit Application</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    modalEl.querySelector('#grievanceForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const subject = document.getElementById('grvSubject').value;
      const sessionDate = document.getElementById('grvDate').value;
      const reason = document.getElementById('grvReason').value.trim();

      const [code, name] = subject.split(' - ');
      await window.dataService.submitAttendanceGrievance({
        subjectCode: code,
        subjectName: name,
        sessionDate,
        reason
      });

      bootstrap.Modal.getInstance(modalEl).hide();
      window.portalShowToast('Application Submitted', 'Your attendance clarification has been routed for department review.', 'success');
      renderStudentGrievances();
    });
  }

  const bsModal = new bootstrap.Modal(modalEl);
  bsModal.show();
}

function renderStudentGrievances() {
  const container = document.getElementById('attendanceGrievancesContainer');
  if (!container) return;

  const grievances = window.dataService._data.attendanceGrievances || [];
  if (grievances.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="portal-card">
      <div class="portal-card-header">
        <h3 class="portal-card-title">
          <i class="bi bi-card-checklist text-primary"></i> Attendance Clarification &amp; Leave Applications
        </h3>
        <span class="badge bg-light text-dark border font-mono-num">${grievances.length} Tickets</span>
      </div>
      <div class="portal-card-body p-0">
        <div class="table-responsive">
          <table class="portal-table mb-0">
            <thead>
              <tr>
                <th style="width: 100px;">Ticket ID</th>
                <th>Course</th>
                <th style="width: 120px;">Missed Date</th>
                <th>Reason / Justification</th>
                <th style="width: 130px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${grievances.map(g => `
                <tr>
                  <td class="font-mono-num fw-bold text-primary">${escapeHtml(g.id)}</td>
                  <td><strong>${escapeHtml(g.subjectCode)}</strong> · ${escapeHtml(g.subjectName || '')}</td>
                  <td class="font-mono-num text-muted small">${escapeHtml(g.sessionDate)}</td>
                  <td class="text-secondary small">${escapeHtml(g.reason)}</td>
                  <td>
                    <span class="status-badge ${g.status === 'Approved' ? 'badge-success-subtle' : 'badge-warning-subtle'}">
                      <i class="bi ${g.status === 'Approved' ? 'bi-check-circle-fill' : 'bi-hourglass-split'} me-1"></i>${escapeHtml(g.status)}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function openSessionHistoryModal(record, threshold) {
  let modalEl = document.getElementById('sessionHistoryModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'sessionHistoryModal';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title fs-6 fw-bold">
              <i class="bi bi-journal-text text-primary me-2"></i>
              <span id="sessionModalSubject">Session Attendance History</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" id="sessionModalBody"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-portal-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
  }

  document.getElementById('sessionModalSubject').textContent = `${record.subjectCode} · ${record.subjectName}`;
  const body = document.getElementById('sessionModalBody');
  const sessions = record.sessions || [];

  body.innerHTML = `
    <div class="row g-2 mb-3 p-3 bg-light rounded border text-center">
      <div class="col-3">
        <span class="text-muted small d-block">Conducted</span>
        <strong class="font-mono-num fs-6">${record.totalClasses}</strong>
      </div>
      <div class="col-3">
        <span class="text-muted small d-block">Attended</span>
        <strong class="font-mono-num text-success fs-6">${record.attendedClasses}</strong>
      </div>
      <div class="col-3">
        <span class="text-muted small d-block">Missed</span>
        <strong class="font-mono-num text-danger fs-6">${record.missedClasses}</strong>
      </div>
      <div class="col-3">
        <span class="text-muted small d-block">Current %</span>
        <strong class="font-mono-num ${record.percentage < threshold ? 'text-danger' : 'text-primary'} fs-6">${record.percentage}%</strong>
      </div>
    </div>

    ${record.percentage < threshold ? `
      <div class="alert alert-danger py-2 px-3 small mb-3">
        <i class="bi bi-info-circle-fill me-1"></i>
        <strong>Recovery Target:</strong> To achieve benchmark of ${threshold}%, you must attend at least <strong>${record.classesNeeded} consecutive upcoming classes</strong> without absence.
      </div>
    ` : ''}

    <h6 class="fw-bold text-dark mb-2" style="font-size: 0.9rem;">Recent Recorded Sessions</h6>
    <div class="table-responsive border rounded">
      <table class="portal-table table-hover mb-0">
        <thead>
          <tr>
            <th style="width: 120px;">Session Date</th>
            <th>Classroom Topic / Lab Experiment</th>
            <th style="width: 130px;" class="text-end">Student Status</th>
          </tr>
        </thead>
        <tbody>
          ${sessions.length > 0 ? sessions.map(s => `
            <tr>
              <td class="font-mono-num small text-muted">${escapeHtml(s.date)}</td>
              <td class="text-dark fw-medium small">${escapeHtml(s.topic)}</td>
              <td class="text-end">
                <span class="status-badge ${s.status === 'Present' ? 'badge-success-subtle' : 'badge-danger-subtle'}">
                  ${s.status === 'Present' ? '<i class="bi bi-check me-1"></i>' : '<i class="bi bi-x me-1"></i>'}${escapeHtml(s.status)}
                </span>
              </td>
            </tr>
          `).join('') : `
            <tr>
              <td colspan="3" class="text-center py-3 text-muted small">No session log entries available.</td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;

  const bsModal = new bootstrap.Modal(modalEl);
  bsModal.show();
}
