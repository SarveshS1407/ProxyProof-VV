from app.models.attendance import AttendanceRecord, AttendanceStatus, VerificationMethod
from app.models.session import AttendanceSession


def test_attendance_percentage_calculations(
    client, student_headers, student_fixture, enrolled_course_fixture, organiser_user, db_session
):
    course_id = enrolled_course_fixture.id
    student_id = student_fixture["user"].id

    # Create 3 sessions
    s1 = AttendanceSession(course_id=course_id, organiser_id=organiser_user.id, title="Session 1", duration_minutes=60, is_closed=True)
    s2 = AttendanceSession(course_id=course_id, organiser_id=organiser_user.id, title="Session 2", duration_minutes=60, is_closed=True)
    s3 = AttendanceSession(course_id=course_id, organiser_id=organiser_user.id, title="Session 3", duration_minutes=60, is_closed=True)
    db_session.add_all([s1, s2, s3])
    db_session.flush()

    # Record: Session 1 PRESENT, Session 2 EXCUSED, Session 3 missed (no record)
    r1 = AttendanceRecord(session_id=s1.id, student_id=student_id, status=AttendanceStatus.PRESENT, verification_method=VerificationMethod.BLE)
    r2 = AttendanceRecord(session_id=s2.id, student_id=student_id, status=AttendanceStatus.EXCUSED, verification_method=VerificationMethod.MANUAL_OVERRIDE)
    db_session.add_all([r1, r2])
    db_session.commit()

    # Query percentages: 2 effective out of 3 = 66.67%
    res = client.get("/api/v1/attendance/student/percentages", headers=student_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["student_name"] == "Alice In Wonderland"
    assert data["overall_percentage"] == 66.67
    assert len(data["course_percentages"]) == 1
    cp = data["course_percentages"][0]
    assert cp["course_code"] == "CS500"
    assert cp["total_sessions"] == 3
    assert cp["attended_sessions"] == 1
    assert cp["excused_sessions"] == 1
    assert cp["attendance_percentage"] == 66.67
    assert len(data["history"]) == 2


def test_zero_division_safety_for_new_course(
    client, student_headers, student_fixture, enrolled_course_fixture
):
    # Enrolled course has 0 sessions created
    res = client.get("/api/v1/attendance/student/percentages", headers=student_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["overall_percentage"] == 0.0
    cp = data["course_percentages"][0]
    assert cp["total_sessions"] == 0
    assert cp["attendance_percentage"] == 0.0
