-- InstaSpark AI Helper (Mira) - Supabase Database Schema
-- Run this script in your Supabase SQL Editor to set up all required tables.

-- 1. Table for Brand Topic Ratios (e.g. 75% Tech, 25% Nature)
CREATE TABLE IF NOT EXISTS public.topic_ratios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT DEFAULT 'default_user',
  topic_name TEXT NOT NULL,
  percentage INTEGER NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial sample ratios
INSERT INTO public.topic_ratios (topic_name, percentage)
VALUES 
  ('Teknologi & AI', 75),
  ('Edukasi & Alam', 25)
ON CONFLICT DO NOTHING;

-- 2. Table for 4-Topic Content Recommendations (Before ACC Approval)
CREATE TABLE IF NOT EXISTS public.content_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  angle TEXT NOT NULL,
  topic_category TEXT NOT NULL,
  format_type TEXT NOT NULL, -- 'Reel' | 'Carousel' | 'Single Post'
  estimated_reach TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table for Approved Content Posts (After ACC Approval - Editorial Calendar Sync)
CREATE TABLE IF NOT EXISTS public.content_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT DEFAULT 'default_user',
  title TEXT NOT NULL,
  concept TEXT,
  script TEXT NOT NULL,
  caption TEXT NOT NULL,
  hashtags TEXT[] DEFAULT '{}',
  image_prompt TEXT,
  video_prompt TEXT,
  veo_duration_seconds INTEGER DEFAULT 8,
  veo_cost_usd NUMERIC(10,2) DEFAULT 0.80,
  veo_cost_idr NUMERIC(12,2) DEFAULT 14000.00,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video', 'carousel')),
  recommended_time TEXT DEFAULT '18:00 WIB',
  scheduled_date DATE DEFAULT CURRENT_DATE,
  scheduled_time TIME DEFAULT '18:00',
  scheduled_at TIMESTAMPTZ,
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Scheduled', 'Published', 'Archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial sample post
INSERT INTO public.content_posts (title, script, caption, status, scheduled_date, scheduled_time)
VALUES 
  ('Morning Routine Reel', 'Scene 1: Studio setup...', 'A day in the life of a design studio 🚀 #StudioLife', 'Published', CURRENT_DATE - INTERVAL '2 days', '09:30'),
  ('Founder Lesson Carousel', 'Slide 1: 3 Lessons...', 'What I wish I knew before starting... ✨ #FounderLessons', 'Scheduled', CURRENT_DATE + INTERVAL '1 day', '12:00')
ON CONFLICT DO NOTHING;

-- 4. Table for User Media Library (Assets created via Veo 3.1 & Nano Banana)
CREATE TABLE IF NOT EXISTS public.user_media_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'default_user',
  post_id UUID REFERENCES public.content_posts(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL,
  title TEXT,
  prompt TEXT,
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'scheduled', 'published', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_content_posts_user_id ON public.content_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_content_posts_scheduled_date ON public.content_posts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_content_posts_status ON public.content_posts(status);
CREATE INDEX IF NOT EXISTS idx_user_media_library_user_id ON public.user_media_library(user_id);
CREATE INDEX IF NOT EXISTS idx_user_media_library_post_id ON public.user_media_library(post_id);

-- 5. Table for Real Marketing News Cache
CREATE TABLE IF NOT EXISTS public.marketing_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  topic_tag TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Table for Daily Brief (3 Trending Topics + 5 Latest News per day)
CREATE TABLE IF NOT EXISTS public.daily_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_date DATE NOT NULL UNIQUE,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  news_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS) policies for open public access during development
ALTER TABLE public.topic_ratios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read/write access for development" ON public.topic_ratios FOR ALL USING (true);
CREATE POLICY "Allow public read/write access for development" ON public.content_recommendations FOR ALL USING (true);
CREATE POLICY "Allow public read/write access for development" ON public.content_posts FOR ALL USING (true);
CREATE POLICY "Allow public read/write access for development" ON public.user_media_library FOR ALL USING (true);
CREATE POLICY "Allow public read/write access for development" ON public.marketing_news FOR ALL USING (true);
CREATE POLICY "Allow public read/write access for development" ON public.daily_briefs FOR ALL USING (true);

