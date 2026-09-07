-- Scalar JSONPath checks avoid re-planning jsonb_each subqueries for every updated village.
CREATE OR REPLACE FUNCTION nonnegative_numbers(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(value)='object' AND NOT jsonb_path_exists(value,'$.* ? (@.type() != "number" || @ < 0)'),false)
$$;
CREATE OR REPLACE FUNCTION nonnegative_integers(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT coalesce(jsonb_typeof(value)='object' AND NOT jsonb_path_exists(value,'$.* ? (@.type() != "number" || @ < 0 || @.floor() != @)'),false)
$$;
