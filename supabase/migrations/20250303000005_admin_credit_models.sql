-- Admin Credit Models System
-- Supports multiple providers with multiple model configurations

-- Drop existing table if exists (for clean migration)
DROP TABLE IF EXISTS public.admin_credit_models CASCADE;

-- Admin configured credit models table
-- Each provider can have multiple models
CREATE TABLE public.admin_credit_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Provider Configuration
    provider_id TEXT NOT NULL,           -- Unique provider ID (e.g., "google", "openai")
    provider_name TEXT NOT NULL,         -- Display name (e.g., "Google Gemini")
    base_url TEXT NOT NULL,              -- API Base URL
    api_keys TEXT[] NOT NULL DEFAULT '{}', -- Array of API keys for rotation
    
    -- Model Configuration
    model_id TEXT NOT NULL,              -- Model ID (e.g., "gemini-3-pro")
    display_name TEXT NOT NULL,          -- Display name (e.g., "Gemini 3 Pro")
    description TEXT,                    -- Advantages/features description
    color TEXT DEFAULT '#6366f1',        -- Primary color (HEX)
    gradient TEXT,                       -- Gradient colors (e.g., "from-blue-500 to-indigo-600")
    endpoint_type TEXT DEFAULT 'openai', -- 'openai' or 'gemini'
    credit_cost INTEGER NOT NULL DEFAULT 1, -- Credit cost per call
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,          -- For load balancing (higher = more priority)
    weight INTEGER DEFAULT 1,            -- For weighted rotation
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one provider + model combination
    UNIQUE(provider_id, model_id)
);

-- Enable RLS
ALTER TABLE public.admin_credit_models ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admin credit models are viewable by everyone"
ON public.admin_credit_models FOR SELECT
USING (true);

CREATE POLICY "Only admins can modify admin credit models"
ON public.admin_credit_models FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- Function to get active credit models grouped by provider
CREATE OR REPLACE FUNCTION public.get_active_credit_models()
RETURNS TABLE (
    provider_id TEXT,
    provider_name TEXT,
    base_url TEXT,
    api_keys TEXT[],
    models JSONB
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
    SELECT 
        m.provider_id,
        m.provider_name,
        m.base_url,
        m.api_keys,
        jsonb_agg(
            jsonb_build_object(
                'id', m.id,
                'model_id', m.model_id,
                'display_name', m.display_name,
                'description', m.description,
                'color', m.color,
                'gradient', m.gradient,
                'endpoint_type', m.endpoint_type,
                'credit_cost', m.credit_cost,
                'priority', m.priority,
                'weight', m.weight
            ) ORDER BY m.priority DESC, m.model_id
        ) as models
    FROM public.admin_credit_models m
    WHERE m.is_active = TRUE
    GROUP BY m.provider_id, m.provider_name, m.base_url, m.api_keys;
$$;

-- Function to get a model for calling (supports rotation)
CREATE OR REPLACE FUNCTION public.get_credit_model_for_call(
    p_model_id TEXT
)
RETURNS TABLE (
    id UUID,
    provider_id TEXT,
    base_url TEXT,
    api_key TEXT,
    model_id TEXT,
    endpoint_type TEXT,
    credit_cost INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_api_keys TEXT[];
    v_selected_key TEXT;
BEGIN
    -- Get the model and its provider's API keys
    SELECT m.id, m.provider_id, m.base_url, m.api_keys, m.model_id, m.endpoint_type, m.credit_cost
    INTO id, provider_id, base_url, v_api_keys, model_id, endpoint_type, credit_cost
    FROM public.admin_credit_models m
    WHERE m.model_id = p_model_id
      AND m.is_active = TRUE
    ORDER BY m.priority DESC, random()
    LIMIT 1;
    
    IF FOUND THEN
        -- Select a random API key from the array (rotation)
        IF array_length(v_api_keys, 1) > 0 THEN
            v_selected_key := v_api_keys[1 + floor(random() * array_length(v_api_keys, 1))::int];
        END IF;
        api_key := v_selected_key;
        RETURN NEXT;
    END IF;
END;
$$;

-- Insert default credit models
INSERT INTO public.admin_credit_models (
    provider_id, provider_name, base_url, api_keys,
    model_id, display_name, description, color, gradient, 
    endpoint_type, credit_cost, priority, weight
) VALUES 
    -- Google Gemini Image Models
    ('google', 'Google Gemini', 'https://cdn.12ai.org', '{}',
     'gemini-3.1-flash-image-preview@system', 
     'Gemini 3.1 Flash Image',
     '快速图像生成，适合日常创意',
     '#4285F4', 'from-blue-500 to-indigo-600',
     'gemini', 1, 10, 1),
     
    ('google', 'Google Gemini', 'https://cdn.12ai.org', '{}',
     'gemini-3-pro-image-preview@system',
     'Gemini 3 Pro Image', 
     '高质量图像生成，适合专业设计',
     '#EA4335', 'from-red-500 to-orange-600',
     'gemini', 2, 10, 1),
     
    ('google', 'Google Gemini', 'https://cdn.12ai.org', '{}',
     'gemini-2.5-flash-image@system',
     'Gemini 2.5 Flash Image',
     '平衡速度与质量',
     '#34A853', 'from-green-500 to-teal-600',
     'gemini', 1, 10, 1)
ON CONFLICT (provider_id, model_id) DO NOTHING;
