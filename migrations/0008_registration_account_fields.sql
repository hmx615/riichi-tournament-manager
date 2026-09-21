ALTER TABLE club_registrations
  ADD COLUMN majsoul_nickname TEXT NOT NULL DEFAULT '';

ALTER TABLE club_registrations
  ADD COLUMN other_platform_rank TEXT NOT NULL DEFAULT '';
