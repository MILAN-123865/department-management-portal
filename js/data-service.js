/**
 * Department Management Portal - Frontend Data Service
 * 
 * ARCHITECTURAL ROLE:
 * This service acts as the clean abstraction layer separating UI presentation
 * from underlying data storage. In this frontend-only phase, all methods read
 * and calculate from window.PORTAL_DATA (with non-sensitive demo preferences
 * cached in localStorage).
 * 
 * FOR BACKEND TEAMMATE:
 * When your backend API (Django REST Framework / Express / Flask) is deployed,
 * replace the internal implementation of these Promise-returning methods with
 * your agreed API fetch calls:
 * - GET  /api/v1/students/me            -> getStudentProfile()
 * - GET  /api/v1/dashboard/stats        -> getStatistics()
 * - GET  /api/v1/academics/subjects     -> getSubjects()
 * - GET  /api/v1/attendance/records     -> getAttendance()
 * - GET  /api/v1/academics/timetable    -> getTimetable()
 * - GET  /api/v1/academics/results      -> getResults()
 * - GET  /api/v1/department/faculty     -> getFaculty()
 * - GET  /api/v1/announcements          -> getAnnouncements()
 * - POST /api/v1/announcements/:id/read -> markAnnouncementAsRead()
 */

class DataService {
  constructor() {
    this._data = window.PORTAL_DATA || {};
    this._initStorage();
  }

  // Initialize non-sensitive demo preferences
  _initStorage() {
    try {
      const readAnnouncements = localStorage.getItem('dmp_read_announcements');
      if (readAnnouncements) {
        const readIds = JSON.parse(readAnnouncements);
        if (Array.isArray(readIds) && this._data.announcements) {
          this._data.announcements.forEach(a => {
            if (readIds.includes(a.id)) {
              a.read = true;
            }
          });
        }
      }
      const customThreshold = localStorage.getItem('dmp_attendance_threshold');
      if (customThreshold && !isNaN(parseFloat(customThreshold))) {
        this._data.config.attendanceThreshold = parseFloat(customThreshold);
      }
    } catch (e) {
      console.warn('LocalStorage unavailable for demo state:', e);
    }
  }

  /**
   * Helper: simulate network resolution
   */
  async _resolve(payload, delayMs = 10) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(JSON.parse(JSON.stringify(payload))), delayMs);
    });
  }

  /**
   * Student Profile
   */
  async getStudentProfile() {
    return this._resolve(this._data.student);
  }

  /**
   * Portal Configuration (Thresholds)
   */
  async getConfig() {
    return this._resolve(this._data.config);
  }

  async setAttendanceThreshold(threshold) {
    const val = Math.max(50, Math.min(95, parseFloat(threshold) || 75.0));
    this._data.config.attendanceThreshold = val;
    try {
      localStorage.setItem('dmp_attendance_threshold', val.toString());
    } catch (e) {}
    return this._resolve({ success: true, threshold: val });
  }

  /**
   * Aggregate Portal Statistics (Calculated dynamically from source data)
   */
  async getStatistics() {
    const student = this._data.student;
    const subjects = this._data.subjects || [];
    const attendance = this._data.attendance || [];
    const results = this._data.results || [];

    // Calculate total conducted and attended classes
    let totalClasses = 0;
    let attendedClasses = 0;
    let belowThresholdCount = 0;
    const threshold = this._data.config?.attendanceThreshold || 75.0;

    attendance.forEach(rec => {
      totalClasses += rec.totalClasses;
      attendedClasses += rec.attendedClasses;
      const pct = (rec.attendedClasses / (rec.totalClasses || 1)) * 100;
      if (pct < threshold) {
        belowThresholdCount++;
      }
    });

    const overallAttendancePct = totalClasses > 0 
      ? Number(((attendedClasses / totalClasses) * 100).toFixed(2)) 
      : 0;

    // Calculate overall average marks percentage
    let totalObtained = 0;
    let totalMax = 0;
    results.forEach(res => {
      totalObtained += res.totalObtained;
      totalMax += res.totalMax;
    });

    const averageMarksPct = totalMax > 0 
      ? Number(((totalObtained / totalMax) * 100).toFixed(2)) 
      : 0;

    // Today's scheduled lectures count
    const todayLectures = await this.getTodayLectures();

    return this._resolve({
      studentName: student.fullName,
      studentId: student.id,
      enrollmentNo: student.enrollmentNo,
      department: student.department,
      semester: student.semester,
      totalSubjects: subjects.length,
      overallAttendancePct,
      totalClasses,
      attendedClasses,
      missedClasses: totalClasses - attendedClasses,
      subjectsBelowThreshold: belowThresholdCount,
      averageMarksPct,
      totalObtainedMarks: totalObtained,
      totalMaxMarks: totalMax,
      todayLecturesCount: todayLectures.length,
      cgpa: student.cgpa,
      attendanceThreshold: threshold
    });
  }

  /**
   * Subjects List & Search/Filter
   */
  async getSubjects(filters = {}) {
    let list = this._data.subjects || [];

    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(s => 
        s.code.toLowerCase().includes(q) || 
        s.name.toLowerCase().includes(q) ||
        s.facultyName.toLowerCase().includes(q)
      );
    }

    if (filters.category && filters.category !== 'all') {
      list = list.filter(s => s.category.toLowerCase() === filters.category.toLowerCase());
    }

    if (filters.type && filters.type !== 'all') {
      list = list.filter(s => s.type.toLowerCase().includes(filters.type.toLowerCase()));
    }

    if (filters.semester && filters.semester !== 'all') {
      list = list.filter(s => s.semester.toString() === filters.semester.toString());
    }

    return this._resolve(list);
  }

  async getSubjectByCode(code) {
    const sub = (this._data.subjects || []).find(s => s.code.toUpperCase() === code.toUpperCase());
    return this._resolve(sub || null);
  }

  /**
   * Attendance Records & Logic
   */
  async getAttendance(filters = {}) {
    const threshold = this._data.config?.attendanceThreshold || 75.0;
    let records = (this._data.attendance || []).map(r => {
      const pct = Number(((r.attendedClasses / (r.totalClasses || 1)) * 100).toFixed(2));
      let status = "Good Attendance";
      let statusClass = "text-success";
      let badgeClass = "badge-success-subtle";

      if (pct < threshold) {
        status = "Below Threshold";
        statusClass = "text-danger";
        badgeClass = "badge-danger-subtle";
      } else if (pct < threshold + 5) {
        status = "Needs Attention";
        statusClass = "text-warning";
        badgeClass = "badge-warning-subtle";
      }

      // Calculate consecutive classes needed to reach threshold
      const classesNeeded = this.calculateConsecutiveClassesNeeded(r.attendedClasses, r.totalClasses, threshold);

      return {
        ...r,
        percentage: pct,
        status,
        statusClass,
        badgeClass,
        classesNeeded
      };
    });

    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      records = records.filter(r => 
        r.subjectCode.toLowerCase().includes(q) || 
        r.subjectName.toLowerCase().includes(q)
      );
    }

    if (filters.status && filters.status !== 'all') {
      records = records.filter(r => r.status.toLowerCase() === filters.status.toLowerCase());
    }

    if (filters.sortBy) {
      if (filters.sortBy === 'percentage_asc') {
        records.sort((a, b) => a.percentage - b.percentage);
      } else if (filters.sortBy === 'percentage_desc') {
        records.sort((a, b) => b.percentage - a.percentage);
      } else if (filters.sortBy === 'name_asc') {
        records.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
      } else if (filters.sortBy === 'code_asc') {
        records.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
      }
    }

    return this._resolve(records);
  }

  /**
   * Math: Calculate number of consecutive classes required to reach target threshold
   * Formula: (Attended + x) / (Total + x) >= target / 100
   * Attended + x >= (target/100) * Total + (target/100) * x
   * x * (1 - target/100) >= (target/100) * Total - Attended
   * x >= ((target/100) * Total - Attended) / (1 - target/100)
   */
  calculateConsecutiveClassesNeeded(attended, total, targetThreshold = 75.0) {
    const currentPct = total > 0 ? (attended / total) * 100 : 0;
    if (currentPct >= targetThreshold) {
      return 0;
    }
    const target = targetThreshold / 100;
    if (target >= 1) return 0;
    const numerator = target * total - attended;
    const denominator = 1 - target;
    const required = Math.ceil(numerator / denominator);
    return Math.max(0, required);
  }

  async getAttendanceSummary() {
    const records = await this.getAttendance();
    let totalClasses = 0;
    let attendedClasses = 0;
    let missedClasses = 0;
    let belowThresholdCount = 0;
    const threshold = this._data.config?.attendanceThreshold || 75.0;

    records.forEach(r => {
      totalClasses += r.totalClasses;
      attendedClasses += r.attendedClasses;
      missedClasses += r.missedClasses;
      if (r.percentage < threshold) {
        belowThresholdCount++;
      }
    });

    const overallPct = totalClasses > 0 ? Number(((attendedClasses / totalClasses) * 100).toFixed(2)) : 0;

    return this._resolve({
      totalClasses,
      attendedClasses,
      missedClasses,
      overallPercentage: overallPct,
      belowThresholdCount,
      threshold
    });
  }

  /**
   * Smart Timetable & Time Status Logic
   */
  async getTimetable(day = 'all', filters = {}) {
    let list = this._data.timetable || [];

    if (day && day !== 'all') {
      list = list.filter(item => item.day.toLowerCase() === day.toLowerCase());
    }

    if (filters.subjectCode && filters.subjectCode !== 'all') {
      list = list.filter(item => item.subjectCode.toUpperCase() === filters.subjectCode.toUpperCase());
    }

    if (filters.type && filters.type !== 'all') {
      list = list.filter(item => item.type.toLowerCase().includes(filters.type.toLowerCase()));
    }

    // Attach real-time or simulated lecture status
    const annotated = list.map(item => {
      const statusInfo = this.calculateLectureStatus(item.day, item.startTime, item.endTime);
      return {
        ...item,
        status: statusInfo.status,
        statusLabel: statusInfo.label,
        statusBadgeClass: statusInfo.badgeClass
      };
    });

    return this._resolve(annotated);
  }

  /**
   * Calculate upcoming, ongoing, completed status for a lecture based on current client time
   */
  calculateLectureStatus(lectureDay, startTimeStr, endTimeStr, simulatedDate = null) {
    const now = simulatedDate ? new Date(simulatedDate) : new Date();
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const currentDayName = daysOfWeek[now.getDay()];

    const isToday = lectureDay.toLowerCase() === currentDayName.toLowerCase();

    if (!isToday) {
      // If not today, determine if day has already passed this week
      const currentDayIdx = now.getDay(); // 0 is Sun, 1 is Mon, etc.
      const dayMap = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 0 };
      const lectureDayIdx = dayMap[lectureDay] || 0;

      if (currentDayIdx > lectureDayIdx && lectureDayIdx !== 0) {
        return { status: "completed", label: "Completed", badgeClass: "badge-neutral-subtle" };
      } else {
        return { status: "scheduled", label: "Scheduled", badgeClass: "badge-primary-subtle" };
      }
    }

    // It's today! Compare hours & minutes
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const [endH, endM] = endTimeStr.split(':').map(Number);

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (nowMinutes < startMinutes) {
      return { status: "upcoming", label: "Upcoming Today", badgeClass: "badge-info-subtle" };
    } else if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) {
      return { status: "ongoing", label: "Happening Now", badgeClass: "badge-success-subtle" };
    } else {
      return { status: "completed", label: "Completed", badgeClass: "badge-neutral-subtle" };
    }
  }

  async getTodayLectures(simulatedDate = null) {
    const now = simulatedDate ? new Date(simulatedDate) : new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let dayName = days[now.getDay()];

    // If Sunday (no classes), fallback to Monday for demo purposes if requested
    let lectures = (this._data.timetable || []).filter(item => item.day.toLowerCase() === dayName.toLowerCase());

    return this._resolve(lectures.map(item => {
      const statusInfo = this.calculateLectureStatus(item.day, item.startTime, item.endTime, simulatedDate);
      return {
        ...item,
        status: statusInfo.status,
        statusLabel: statusInfo.label,
        statusBadgeClass: statusInfo.badgeClass
      };
    }));
  }

  /**
   * Internal Marks & Results
   */
  async getResults(filters = {}) {
    let list = this._data.results || [];

    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(r => 
        r.subjectCode.toLowerCase().includes(q) || 
        r.subjectName.toLowerCase().includes(q)
      );
    }

    if (filters.category && filters.category !== 'all') {
      list = list.filter(r => r.performanceCategory.toLowerCase() === filters.category.toLowerCase());
    }

    if (filters.sortBy) {
      if (filters.sortBy === 'percentage_desc') {
        list.sort((a, b) => b.percentage - a.percentage);
      } else if (filters.sortBy === 'percentage_asc') {
        list.sort((a, b) => a.percentage - b.percentage);
      } else if (filters.sortBy === 'name_asc') {
        list.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
      } else if (filters.sortBy === 'code_asc') {
        list.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
      }
    }

    return this._resolve(list);
  }

  async getResultsSummary() {
    const results = this._data.results || [];
    let totalObtained = 0;
    let totalMax = 0;

    let highest = null;
    let lowest = null;

    results.forEach(res => {
      totalObtained += res.totalObtained;
      totalMax += res.totalMax;

      if (!highest || res.percentage > highest.percentage) {
        highest = res;
      }
      if (!lowest || res.percentage < lowest.percentage) {
        lowest = res;
      }
    });

    const averagePercentage = totalMax > 0 
      ? Number(((totalObtained / totalMax) * 100).toFixed(2)) 
      : 0;

    return this._resolve({
      totalEvaluatedSubjects: results.length,
      totalObtainedMarks: totalObtained,
      totalMaxMarks: totalMax,
      averagePercentage,
      highestScoringSubject: highest ? {
        code: highest.subjectCode,
        name: highest.subjectName,
        percentage: highest.percentage,
        grade: highest.grade
      } : null,
      lowestScoringSubject: lowest ? {
        code: lowest.subjectCode,
        name: lowest.subjectName,
        percentage: lowest.percentage,
        grade: lowest.grade
      } : null
    });
  }

  /**
   * Faculty & Subject Directory
   */
  async getFaculty(filters = {}) {
    let list = this._data.faculty || [];

    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      list = list.filter(f => 
        f.fullName.toLowerCase().includes(q) || 
        f.designation.toLowerCase().includes(q) ||
        f.office.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q) ||
        f.subjectsTaught.some(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
      );
    }

    if (filters.designation && filters.designation !== 'all') {
      list = list.filter(f => f.designation.toLowerCase().includes(filters.designation.toLowerCase()));
    }

    if (filters.sortBy) {
      if (filters.sortBy === 'name_asc') {
        list.sort((a, b) => a.fullName.localeCompare(b.fullName));
      } else if (filters.sortBy === 'experience_desc') {
        list.sort((a, b) => b.experienceYears - a.experienceYears);
      } else if (filters.sortBy === 'publications_desc') {
        list.sort((a, b) => b.publicationsCount - a.publicationsCount);
      }
    }

    return this._resolve(list);
  }

  async getFacultyById(id) {
    const fac = (this._data.faculty || []).find(f => f.id === id);
    return this._resolve(fac || null);
  }

  /**
   * Announcements & Notifications
   */
  async getAnnouncements() {
    return this._resolve(this._data.announcements || []);
  }

  async markAnnouncementAsRead(id) {
    const ann = (this._data.announcements || []).find(a => a.id === id);
    if (ann) {
      ann.read = true;
      try {
        const readAnnouncements = JSON.parse(localStorage.getItem('dmp_read_announcements') || '[]');
        if (!readAnnouncements.includes(id)) {
          readAnnouncements.push(id);
          localStorage.setItem('dmp_read_announcements', JSON.stringify(readAnnouncements));
        }
      } catch (e) {}
    }
    return this._resolve({ success: true, id });
  }

  async markAllAnnouncementsRead() {
    if (this._data.announcements) {
      this._data.announcements.forEach(a => { a.read = true; });
      try {
        const ids = this._data.announcements.map(a => a.id);
        localStorage.setItem('dmp_read_announcements', JSON.stringify(ids));
      } catch (e) {}
    }
    return this._resolve({ success: true });
  }

  /**
   * User Session & Role Management (Frontend Demo)
   */
  async getCurrentUser() {
    let role = 'student';
    let userId = 'STU-2023-0482';

    try {
      const storedRole = localStorage.getItem('dmp_active_role');
      const storedId = localStorage.getItem('dmp_active_user_id');
      if (storedRole === 'faculty') {
        role = 'faculty';
        userId = storedId || 'FAC-01';
      }
    } catch (e) {}

    if (role === 'faculty') {
      const fac = (this._data.faculty || []).find(f => f.id === userId) || this._data.faculty[0];
      return this._resolve({
        ...fac,
        role: 'faculty',
        isFaculty: true,
        displayName: fac.fullName,
        displayRole: `${fac.designation}`
      });
    }

    return this._resolve({
      ...this._data.student,
      role: 'student',
      isFaculty: false,
      displayName: this._data.student.fullName,
      displayRole: `Student · Sem ${this._data.student.semester}`
    });
  }

  async isFaculty() {
    try {
      return localStorage.getItem('dmp_active_role') === 'faculty';
    } catch (e) {
      return false;
    }
  }

  async loginFaculty(identifier, password = '') {
    // Identifier can be faculty email, faculty ID, or name keyword
    const q = (identifier || '').toLowerCase().trim();
    const list = this._data.faculty || [];
    const faculty = list.find(f => 
      f.id.toLowerCase() === q || 
      f.email.toLowerCase() === q || 
      f.fullName.toLowerCase().includes(q)
    );

    if (!faculty) {
      return this._resolve({
        success: false,
        error: 'Invalid faculty credentials. Try using Dr. Sunita Sharma or s.sharma@eng.university.edu.'
      });
    }

    try {
      localStorage.setItem('dmp_active_role', 'faculty');
      localStorage.setItem('dmp_active_user_id', faculty.id);
    } catch (e) {}

    return this._resolve({
      success: true,
      user: {
        ...faculty,
        role: 'faculty',
        isFaculty: true
      }
    });
  }

  async loginStudent(identifier = '', password = '') {
    try {
      localStorage.setItem('dmp_active_role', 'student');
      localStorage.setItem('dmp_active_user_id', 'STU-2023-0482');
    } catch (e) {}

    return this._resolve({
      success: true,
      user: {
        ...this._data.student,
        role: 'student',
        isFaculty: false
      }
    });
  }

  async logoutUser() {
    try {
      localStorage.removeItem('dmp_active_role');
      localStorage.removeItem('dmp_active_user_id');
    } catch (e) {}
    return this._resolve({ success: true });
  }

  async switchRole(targetRole, targetId = null) {
    try {
      if (targetRole === 'faculty') {
        localStorage.setItem('dmp_active_role', 'faculty');
        localStorage.setItem('dmp_active_user_id', targetId || 'FAC-01');
      } else {
        localStorage.setItem('dmp_active_role', 'student');
        localStorage.setItem('dmp_active_user_id', 'STU-2023-0482');
      }
    } catch (e) {}
    return this._resolve({ success: true, role: targetRole });
  }

  async getFacultyTeachingStats(facultyId = 'FAC-01') {
    const faculty = (this._data.faculty || []).find(f => f.id === facultyId) || this._data.faculty[0];
    const taughtCodes = (faculty.subjectsTaught || []).map(s => s.code);
    
    // Lectures taught
    const allTimetable = this._data.timetable || [];
    const facultyTimetable = allTimetable.filter(t => taughtCodes.includes(t.subjectCode));

    // Attendance in taught subjects
    const allAttendance = this._data.attendance || [];
    const subjectAttendance = allAttendance.filter(a => taughtCodes.includes(a.subjectCode));

    let totalClassesHeld = 0;
    let totalClassesAttended = 0;
    subjectAttendance.forEach(a => {
      totalClassesHeld += a.totalClasses;
      totalClassesAttended += a.attendedClasses;
    });

    const avgAttendance = totalClassesHeld > 0 
      ? Number(((totalClassesAttended / totalClassesHeld) * 100).toFixed(1)) 
      : 86.5;

    return this._resolve({
      faculty,
      taughtCodes,
      weeklyLectureHours: facultyTimetable.length,
      timetable: facultyTimetable,
      averageStudentAttendance: avgAttendance,
      subjects: subjectAttendance
    });
  }
}

window.dataService = new DataService();
