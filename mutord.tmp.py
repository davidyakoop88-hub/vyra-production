import io, sys

p = 'server/stream-sessions.js'
s = io.open(p, encoding='utf-8').read()

BLOCK = """               AND NOT EXISTS (
                 SELECT 1 FROM stream_event_outbox aldre
                  WHERE aldre.workspace_id = k.workspace_id
                    AND aldre.id < k.id
                    AND aldre.published_at IS NULL)
"""

if sys.argv[1] == 'mutera':
    # Ta bort HELA villkoret. Det bar inga parametrar, sa ingen $n blir oanvand och SQL:en forblir
    # syntaktiskt giltig: raden fore slutar med ett villkor och raden efter ar ORDER BY.
    assert BLOCK in s, 'ordningsvillkoret hittades inte'
    io.open(p, 'w', encoding='utf-8').write(s.replace(BLOCK, "               /*MUTORD ordningsvillkoret bortmuterat*/\n", 1))
    print('mutation applicerad')
else:
    MARK = "               /*MUTORD ordningsvillkoret bortmuterat*/\n"
    assert MARK in s, 'mutationen hittades inte'
    io.open(p, 'w', encoding='utf-8').write(s.replace(MARK, BLOCK, 1))
    print('aterstalld')
