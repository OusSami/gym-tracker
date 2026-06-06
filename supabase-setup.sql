-- FULL SCHEMA RESET — safe to re-run, uses IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS

-- 1. Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  unit_system text DEFAULT 'metric',
  birthday date,
  fitness_level text DEFAULT 'beginner',
  weight_kg numeric,
  height_cm numeric,
  goal text DEFAULT 'general',
  sex text DEFAULT 'male',
  onboarded boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Weight history
CREATE TABLE IF NOT EXISTS weight_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  weight_kg numeric NOT NULL,
  recorded_at date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- 3. Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  muscles_trained text[] DEFAULT '{}',
  image_url text,
  session_date date DEFAULT CURRENT_DATE,
  duration_seconds integer DEFAULT 0,
  ai_report jsonb,
  created_at timestamptz DEFAULT now()
);

-- 4. Exercises
CREATE TABLE IF NOT EXISTS exercises (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  muscle text,
  duration_seconds integer DEFAULT 0,
  image_hidden boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 5. Sets
CREATE TABLE IF NOT EXISTS sets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  exercise_id uuid REFERENCES exercises(id) ON DELETE CASCADE NOT NULL,
  set_number integer NOT NULL,
  weight_kg numeric NOT NULL,
  reps integer NOT NULL,
  duration_seconds integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 6. Body analyses
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

-- 7. Meals (NEW — full nutrition tracking)
CREATE TABLE IF NOT EXISTS meals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  meal_type text NOT NULL, -- breakfast|lunch|dinner|snack|water
  meal_name text,
  meal_date date DEFAULT CURRENT_DATE,
  logged_at timestamptz DEFAULT now(),
  -- Calories
  total_calories integer DEFAULT 0,
  -- Macros
  protein_g numeric DEFAULT 0,
  carbs_g numeric DEFAULT 0,
  fat_g numeric DEFAULT 0,
  fiber_g numeric DEFAULT 0,
  sugar_g numeric DEFAULT 0,
  saturated_fat_g numeric DEFAULT 0,
  cholesterol_mg numeric DEFAULT 0,
  sodium_mg numeric DEFAULT 0,
  potassium_mg numeric DEFAULT 0,
  -- Meta
  portion_note text,
  health_score integer,
  ingredients jsonb,
  vitamins text[],
  allergens text[],
  img_preview text, -- base64 thumbnail (small)
  created_at timestamptz DEFAULT now()
);

-- Water tracking
CREATE TABLE IF NOT EXISTS water_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount_ml integer NOT NULL,
  logged_at timestamptz DEFAULT now(),
  log_date date DEFAULT CURRENT_DATE
);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "own profile" ON profiles;
  CREATE POLICY "own profile" ON profiles FOR ALL USING (auth.uid() = id);
  DROP POLICY IF EXISTS "own sessions" ON sessions;
  CREATE POLICY "own sessions" ON sessions FOR ALL USING (auth.uid() = user_id);
  DROP POLICY IF EXISTS "own exercises" ON exercises;
  CREATE POLICY "own exercises" ON exercises FOR ALL USING (
    EXISTS (SELECT 1 FROM sessions WHERE sessions.id = exercises.session_id AND sessions.user_id = auth.uid())
  );
  DROP POLICY IF EXISTS "own sets" ON sets;
  CREATE POLICY "own sets" ON sets FOR ALL USING (
    EXISTS (SELECT 1 FROM exercises JOIN sessions ON sessions.id = exercises.session_id WHERE exercises.id = sets.exercise_id AND sessions.user_id = auth.uid())
  );
  DROP POLICY IF EXISTS "own weight" ON weight_history;
  CREATE POLICY "own weight" ON weight_history FOR ALL USING (auth.uid() = user_id);
  DROP POLICY IF EXISTS "own body" ON body_analyses;
  CREATE POLICY "own body" ON body_analyses FOR ALL USING (auth.uid() = user_id);
  DROP POLICY IF EXISTS "own meals" ON meals;
  CREATE POLICY "own meals" ON meals FOR ALL USING (auth.uid() = user_id);
  DROP POLICY IF EXISTS "own water" ON water_logs;
  CREATE POLICY "own water" ON water_logs FOR ALL USING (auth.uid() = user_id);
END $$;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('workout-photos','workout-photos',true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('body-photos','body-photos',true) ON CONFLICT DO NOTHING;

DO $$ BEGIN
  DROP POLICY IF EXISTS "upload workout" ON storage.objects;
  CREATE POLICY "upload workout" ON storage.objects FOR INSERT WITH CHECK (bucket_id='workout-photos' AND auth.uid()::text=(storage.foldername(name))[1]);
  DROP POLICY IF EXISTS "read workout" ON storage.objects;
  CREATE POLICY "read workout" ON storage.objects FOR SELECT USING (bucket_id='workout-photos');
  DROP POLICY IF EXISTS "upload body" ON storage.objects;
  CREATE POLICY "upload body" ON storage.objects FOR INSERT WITH CHECK (bucket_id='body-photos' AND auth.uid()::text=(storage.foldername(name))[1]);
  DROP POLICY IF EXISTS "read body" ON storage.objects;
  CREATE POLICY "read body" ON storage.objects FOR SELECT USING (bucket_id='body-photos');
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON sessions(user_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_exercises_session ON exercises(session_id);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON sets(exercise_id);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, meal_date DESC);
CREATE INDEX IF NOT EXISTS idx_water_user_date ON water_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_body_user ON body_analyses(user_id, analyzed_at DESC);
