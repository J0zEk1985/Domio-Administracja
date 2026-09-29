-- Per-announcement kiosk colors for /display (building e-board).
-- NULL = inherit the kiosk light/dark theme. Home app does not use these columns.

ALTER TABLE public.e_board_messages
  ADD COLUMN IF NOT EXISTS display_bg_color text,
  ADD COLUMN IF NOT EXISTS display_text_color text;

ALTER TABLE public.e_board_messages
  DROP CONSTRAINT IF EXISTS e_board_messages_display_bg_color_hex,
  DROP CONSTRAINT IF EXISTS e_board_messages_display_text_color_hex;

ALTER TABLE public.e_board_messages
  ADD CONSTRAINT e_board_messages_display_bg_color_hex
    CHECK (display_bg_color IS NULL OR display_bg_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT e_board_messages_display_text_color_hex
    CHECK (display_text_color IS NULL OR display_text_color ~ '^#[0-9A-Fa-f]{6}$');

COMMENT ON COLUMN public.e_board_messages.display_bg_color IS
  'Kiosk /display slide background (#RRGGBB). NULL inherits the screen theme.';
COMMENT ON COLUMN public.e_board_messages.display_text_color IS
  'Kiosk /display title and body color (#RRGGBB). NULL inherits the screen theme.';

-- RETURNS TABLE column list changed — REPLACE cannot alter the result type.
DROP FUNCTION IF EXISTS public.get_published_eboard_messages(uuid);

CREATE FUNCTION public.get_published_eboard_messages(p_community_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  msg_type public.eboard_msg_type,
  valid_until timestamptz,
  display_from timestamptz,
  display_until timestamptz,
  created_at timestamptz,
  display_bg_color text,
  display_text_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.title,
    m.content,
    m.msg_type,
    m.valid_until,
    m.display_from,
    m.display_until,
    m.created_at,
    m.display_bg_color,
    m.display_text_color
  FROM public.e_board_messages m
  WHERE m.community_id = p_community_id
    AND m.status = 'published'
    AND COALESCE(m.is_active, true) = true
    AND (m.valid_until IS NULL OR m.valid_until >= CURRENT_DATE)
  ORDER BY m.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_published_eboard_messages(uuid) IS
  'Anonymous kiosk snapshot for /display/:communityId. Includes optional per-slide colors.';

REVOKE ALL ON FUNCTION public.get_published_eboard_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_eboard_messages(uuid) TO anon, authenticated;
