import os, psycopg2, psycopg2.extras
conn = psycopg2.connect(os.environ['DATABASE_URL'], cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()
cur.execute('SELECT id, name, short_name FROM teams ORDER BY id')
print('--- TEAMS ---')
for t in cur.fetchall():
    print(t)

cur.execute("""
    SELECT p.id, p.web_name, t.short_name as team, p.position, p.now_cost, p.status, p.chance_of_playing,
           pp.expected_points, pp.expected_minutes
    FROM players p
    JOIN teams t ON p.team_id = t.id
    LEFT JOIN player_projections pp ON pp.player_id = p.id AND pp.gameweek = 5
    WHERE p.web_name ILIKE '%gro%'
    ORDER BY p.web_name;
""")
print('--- GROSS ---')
for r in cur.fetchall():
    print(dict(r))

from main import fetch_player_pool, solve_chip_plan, OptimizeRequest

# Let's get the user squad from FPL or database
# We can check what picks were sent in the optimize request
# Or fetch picks from FPL API for entry 8796308 gw 5
import httpx
res = httpx.get("https://fantasy.premierleague.com/api/entry/8796308/event/4/picks/")
if not res.is_success:
    res = httpx.get("https://fantasy.premierleague.com/api/entry/8796308/event/3/picks/")
picks_data = res.json()
current_squad = [p["element"] for p in picks_data["picks"]]
bank = picks_data.get("entry_history", {}).get("bank", 0) / 10.0

req = OptimizeRequest(
    team_id=8796308,
    gameweek=5,
    current_squad=current_squad,
    bank=bank,
    free_transfers=1,
    chip="none",
    horizon=1
)

pool = fetch_player_pool(5, 1)
plan = solve_chip_plan(req, pool, "none")

print("=== STARTING XI ===")
for p in plan["starting_xi"]:
    print(f"{p.position:3s} | {p.web_name:15s} | {p.team:3s} | xP: {p.projected_points:.2f} | Price: {p.price:.1f} | C: {p.is_captain} | VC: {p.is_vice_captain}")

print("\n=== BENCH ===")
for p in plan["bench"]:
    print(f"{p.position:3s} | {p.web_name:15s} | {p.team:3s} | xP: {p.projected_points:.2f} | Price: {p.price:.1f}")

print("\n=== TRANSFERS ===")
for t in plan["transfers"]:
    print(f"OUT: {t.out.web_name} ({t.out.projected_points:.2f}) -> IN: {t.in_.web_name} ({t.in_.projected_points:.2f}) [Gain: {t.points_gain:.2f}]")







