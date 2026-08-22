create table if not exists ab_tests (
  test_id text primary key,
  test_name text not null,
  segment text not null,
  channel text not null,
  success_metric text not null,
  status text not null,
  created_at timestamptz not null,
  ended_at timestamptz,
  winner_group_id text,
  groups jsonb not null
);
