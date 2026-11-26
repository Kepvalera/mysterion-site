-- Additive metadata only. Existing courses, lessons, orders and grants are untouched.
CREATE TABLE program_settings (
 course_id TEXT PRIMARY KEY REFERENCES platform_courses(id) ON DELETE CASCADE,
 program_type TEXT NOT NULL CHECK(program_type IN ('conference','school','stream','course','bundle','seminar')),
 parent_id TEXT REFERENCES platform_courses(id) ON DELETE RESTRICT,
 sort_order INTEGER NOT NULL DEFAULT 0,
 syllabus TEXT NOT NULL DEFAULT '{}',
 CHECK(parent_id IS NULL OR parent_id!=course_id)
);
CREATE INDEX program_settings_parent ON program_settings(parent_id,sort_order);
CREATE TABLE video_metadata (
 video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
 duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds>=0)
);
CREATE UNIQUE INDEX platform_lesson_video_once ON platform_lessons(course_id,video_id) WHERE video_id IS NOT NULL;
