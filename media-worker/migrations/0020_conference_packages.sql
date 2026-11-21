-- Additive conference package presentation metadata.
CREATE TABLE IF NOT EXISTS course_covers (
 course_id TEXT PRIMARY KEY REFERENCES platform_courses(id) ON DELETE CASCADE,
 mime TEXT NOT NULL,
 bytes BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_lessons_paid_package
ON platform_lessons(course_id,position,state,video_id);
