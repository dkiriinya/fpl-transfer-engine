import os, psycopg2, psycopg2.extras
conn = psycopg2.connect(os.environ['DATABASE_URL'], cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()
cur.execute('SELECT id, name, short_name FROM teams ORDER BY id')
print('--- TEAMS ---')
for t in cur.fetchall():
    print(t)

cur.execute("""
    SELECT p.id, p.web_name, p.team_id, t.short_name, p.now_cost, p.status, p.chance_of_playing,
           pp.gameweek, pp.expected_points, pp.expected_minutes
    FROM players p
    JOIN teams t ON p.team_id = t.id
    LEFT JOIN player_projections pp ON pp.player_id = p.id
    WHERE p.web_name IN ('Rice', 'Mainoo', 'Rogers')
    ORDER BY p.web_name, pp.gameweek;
""")
print('--- PLAYERS ---')
for r in cur.fetchall():
    print(dict(r))

user_squad_ids = [496, 8, 390, 4, 356, 124, 427, 40, 368, 165, 411, 497, 346, 277, 547]
pool_by_id = {p['player_id']: p for p in pool}

print("\n--- USER CURRENT SQUAD IN DB ---")
for pid in user_squad_ids:
    if pid in pool_by_id:
        p = pool_by_id[pid]
        print(f"ID {p['player_id']:3d} | {p['web_name']:15s} | {p['position']} | {p['team']} | £{p['price']:4.1f}m | xP: {p['projected_points']}")
    else:
        print(f"ID {pid:3d} NOT FOUND IN POOL")
