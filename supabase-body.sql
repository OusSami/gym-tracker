-- Add body analysis table
CREATE TABLE IF NOT EXISTS body_analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  image_url text,
  analyzed_at date DEFAULT CURRENT_DATE,
  -- Scores (0-100)
  overall_score integer,
  muscle_definition integer,
  symmetry_score integer,
  body_fat_estimate numeric,
  -- Per muscle group development (0-10)
  chest_dev integer,
  back_dev integer,
  shoulders_dev integer,
  arms_dev integer,
  core_dev integer,
  legs_dev integer,
  -- Text analysis
  strengths text[],
  weaknesses text[],
  recommendations text[],
  focus_muscles text[],
  full_report text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE body_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own body" ON body_analyses;
CREATE POLICY "own body" ON body_analyses FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_body_user ON body_analyses(user_id, analyzed_at DESC);

-- Storage bucket for body photos
INSERT INTO storage.buckets (id, name, public) VALUES ('body-photos', 'body-photos', true) ON CONFLICT DO NOTHING;
DROP POLICY IF EXISTS "upload body" ON storage.objects;
DROP POLICY IF EXISTS "read body" ON storage.objects;
CREATE POLICY "upload body" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "read body" ON storage.objects FOR SELECT USING (bucket_id = 'body-photos');

-- Add session report column to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ai_report jsonb;
-- Add image_hidden column to exercises
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS image_hidden boolean DEFAULT false;

-- Full meal tracking table
CREATE TABLE IF NOT EXISTS meals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  meal_date date DEFAULT CURRENT_DATE,
  meal_type text NOT NULL, -- 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'water'
  meal_name text,
  image_url text,
  -- Calories
  total_calories numeric DEFAULT 0,
  -- Macros
  protein_g numeric DEFAULT 0,
  carbs_g numeric DEFAULT 0,
  fat_g numeric DEFAULT 0,
  -- Nutrients
  fiber_g numeric DEFAULT 0,
  sugar_g numeric DEFAULT 0,
  saturated_fat_g numeric DEFAULT 0,
  cholesterol_mg numeric DEFAULT 0,
  sodium_mg numeric DEFAULT 0,
  potassium_mg numeric DEFAULT 0,
  calcium_mg numeric DEFAULT 0,
  iron_mg numeric DEFAULT 0,
  vitamin_c_mg numeric DEFAULT 0,
  -- Water tracking
  water_ml numeric DEFAULT 0,
  -- Details
  ingredients jsonb DEFAULT '[]',
  health_score integer,
  notes text,
  raw_analysis jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own meals" ON meals;
CREATE POLICY "own meals" ON meals FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, meal_date DESC);

-- Storage for meal photos
INSERT INTO storage.buckets (id, name, public) VALUES ('meal-photos', 'meal-photos', true) ON CONFLICT DO NOTHING;
DROP POLICY IF EXISTS "upload meal" ON storage.objects;
DROP POLICY IF EXISTS "read meal" ON storage.objects;
CREATE POLICY "upload meal" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'meal-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "read meal" ON storage.objects FOR SELECT USING (bucket_id = 'meal-photos');
