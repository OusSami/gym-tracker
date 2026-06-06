-- Run this in Supabase SQL Editor → it is safe to run multiple times
-- It adds ALL missing columns to existing tables

-- ── profiles ──────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fitness_level text DEFAULT 'beginner';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal text DEFAULT 'general';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sex text DEFAULT 'male';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_kg numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS height_cm numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unit_system text DEFAULT 'metric';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarded boolean DEFAULT false;

-- ── sessions ──────────────────────────────────────────────────────────────
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ai_report jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS duration_seconds integer DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_date date DEFAULT CURRENT_DATE;

-- ── exercises ─────────────────────────────────────────────────────────────
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS image_hidden boolean DEFAULT false;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS duration_seconds integer DEFAULT 0;

-- ── sets ──────────────────────────────────────────────────────────────────
ALTER TABLE sets ADD COLUMN IF NOT EXISTS duration_seconds integer DEFAULT 0;

-- ── meals (create if missing, add all columns if exists) ──────────────────
CREATE TABLE IF NOT EXISTS meals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  meal_type text NOT NULL,
  meal_name text,
  meal_date date DEFAULT CURRENT_DATE,
  logged_at timestamptz DEFAULT now(),
  total_calories integer DEFAULT 0,
  protein_g numeric DEFAULT 0,
  carbs_g numeric DEFAULT 0,
  fat_g numeric DEFAULT 0,
  fiber_g numeric DEFAULT 0,
  sugar_g numeric DEFAULT 0,
  saturated_fat_g numeric DEFAULT 0,
  polyunsaturated_fat_g numeric DEFAULT 0,
  monounsaturated_fat_g numeric DEFAULT 0,
  trans_fat_g numeric DEFAULT 0,
  cholesterol_mg numeric DEFAULT 0,
  sodium_mg numeric DEFAULT 0,
  potassium_mg numeric DEFAULT 0,
  vitamin_a_mcg numeric DEFAULT 0,
  vitamin_c_mg numeric DEFAULT 0,
  calcium_mg numeric DEFAULT 0,
  iron_mg numeric DEFAULT 0,
  portion_note text,
  health_score integer,
  ingredients jsonb,
  vitamins text[],
  allergens text[],
  created_at timestamptz DEFAULT now()
);

ALTER TABLE meals ADD COLUMN IF NOT EXISTS polyunsaturated_fat_g numeric DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS monounsaturated_fat_g numeric DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS trans_fat_g numeric DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS vitamin_a_mcg numeric DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS vitamin_c_mg numeric DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS calcium_mg numeric DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS iron_mg numeric DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS cholesterol_mg numeric DEFAULT 0;

-- ── water_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS water_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount_ml integer NOT NULL,
  logged_at timestamptz DEFAULT now(),
  log_date date DEFAULT CURRENT_DATE
);

-- ── body_analyses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS body_analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  image_url text,
  analyzed_at date DEFAULT CURRENT_DATE,
  overall_score integer,
  muscle_definition integer,
  symmetry_score integer,
  body_fat_estimate numeric,
  chest_dev integer, back_dev integer, shoulders_dev integer,
  arms_dev integer, core_dev integer, legs_dev integer,
  strengths text[], weaknesses text[], recommendations text[],
  focus_muscles text[], full_report text,
  created_at timestamptz DEFAULT now()
);

-- ── weight_history ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weight_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  weight_kg numeric NOT NULL,
  recorded_at date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "own meals" ON meals;
  CREATE POLICY "own meals" ON meals FOR ALL USING (auth.uid() = user_id);
  DROP POLICY IF EXISTS "own water" ON water_logs;
  CREATE POLICY "own water" ON water_logs FOR ALL USING (auth.uid() = user_id);
  DROP POLICY IF EXISTS "own body" ON body_analyses;
  CREATE POLICY "own body" ON body_analyses FOR ALL USING (auth.uid() = user_id);
  DROP POLICY IF EXISTS "own weight" ON weight_history;
  CREATE POLICY "own weight" ON weight_history FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── Storage ───────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('workout-photos','workout-photos',true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('body-photos','body-photos',true) ON CONFLICT DO NOTHING;

-- ── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, meal_date DESC);
CREATE INDEX IF NOT EXISTS idx_water_user_date ON water_logs(user_id, log_date DESC);

SELECT 'Migration complete ✓' as status;

-- Session start/end timestamps for reminder data
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- Custom meal templates
CREATE TABLE IF NOT EXISTS custom_meals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  meal_name text NOT NULL,
  meal_type text DEFAULT 'snack',
  total_calories integer DEFAULT 0,
  protein_g numeric DEFAULT 0,
  carbs_g numeric DEFAULT 0,
  fat_g numeric DEFAULT 0,
  fiber_g numeric DEFAULT 0,
  sugar_g numeric DEFAULT 0,
  saturated_fat_g numeric DEFAULT 0,
  sodium_mg numeric DEFAULT 0,
  potassium_mg numeric DEFAULT 0,
  portion_note text,
  ingredients jsonb,
  times_used integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE custom_meals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own custom meals" ON custom_meals;
CREATE POLICY "own custom meals" ON custom_meals FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION increment_meal_usage(meal_id uuid)
RETURNS void AS $$
  UPDATE custom_meals SET times_used = times_used + 1 WHERE id = meal_id;
$$ LANGUAGE SQL;

-- Daily nutrition reports (persisted per user per date)
CREATE TABLE IF NOT EXISTS daily_nutrition_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  report_date date NOT NULL,
  report jsonb NOT NULL,
  meals_hash text, -- simple checksum to detect if meals changed
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, report_date)
);
ALTER TABLE daily_nutrition_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own nutrition reports" ON daily_nutrition_reports;
CREATE POLICY "own nutrition reports" ON daily_nutrition_reports FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_reports_user_date ON daily_nutrition_reports(user_id, report_date DESC);

-- ── WORKOUT TEMPLATES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workout_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  muscles text[] DEFAULT '{}',
  exercises jsonb DEFAULT '[]', -- [{name, muscle, sets_target}]
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own templates" ON workout_templates;
CREATE POLICY "own templates" ON workout_templates FOR ALL USING (auth.uid() = user_id);

-- ── WEEKLY AI SUMMARIES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  week_start date NOT NULL,
  summary jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_start)
);
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own summaries" ON weekly_summaries;
CREATE POLICY "own summaries" ON weekly_summaries FOR ALL USING (auth.uid() = user_id);

-- ── NEW TABLES FOR v10.5 ───────────────────────────────────────────────────

-- Workout templates
CREATE TABLE IF NOT EXISTS workout_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  muscles text[] DEFAULT '{}',
  exercises jsonb DEFAULT '[]', -- [{name, muscle, order}]
  created_at timestamptz DEFAULT now()
);
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own templates" ON workout_templates;
CREATE POLICY "own templates" ON workout_templates FOR ALL USING (auth.uid() = user_id);

-- Weekly AI summaries
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  week_start date NOT NULL,
  report jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_start)
);
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own weekly summaries" ON weekly_summaries;
CREATE POLICY "own weekly summaries" ON weekly_summaries FOR ALL USING (auth.uid() = user_id);

-- Add rest_duration to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rest_duration_seconds integer DEFAULT 90;

-- Add total_duration_seconds to sets table (active rep time vs total interval)
ALTER TABLE sets ADD COLUMN IF NOT EXISTS total_duration_seconds integer DEFAULT 0;

-- Analysis reports (replaces weekly_summaries for all period types)
CREATE TABLE IF NOT EXISTS analysis_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  period_type text NOT NULL, -- week | month | quarter | halfyear | year | alltime | custom
  period_key text NOT NULL,  -- e.g. "2026-05-25" for week, "2026-05" for month, "2026-Q2" etc
  period_from date NOT NULL,
  period_to date NOT NULL,
  report jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_type, period_key)
);
ALTER TABLE analysis_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own analysis reports" ON analysis_reports;
CREATE POLICY "own analysis reports" ON analysis_reports FOR ALL USING (auth.uid() = user_id);

-- Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  subscription jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own push subs" ON push_subscriptions;
CREATE POLICY "own push subs" ON push_subscriptions FOR ALL USING (auth.uid() = user_id);

-- Add warmup/stretch tracking to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS warmup_duration_seconds integer DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS warmup_skipped boolean DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS stretch_duration_seconds integer DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS stretch_skipped boolean DEFAULT false;

-- Store which warmup/stretch exercises were checked off
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS warmup_exercises text[] DEFAULT '{}';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS stretch_exercises text[] DEFAULT '{}';
