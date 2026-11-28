"""Resolve conflitos de docs/DECISIONS.md mantendo os dois lados: primeiro o da main (theirs),
depois o da branch (ours). Uso: python3 resolve-decisions.py <arquivo>"""
import re
import sys

path = sys.argv[1]
text = open(path, encoding='utf-8').read()
pattern = re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', re.S)


def join(match: re.Match) -> str:
    ours, theirs = match.group(1), match.group(2)
    parts = [p.strip('\n') for p in (theirs, ours) if p.strip()]
    return '\n\n'.join(parts) + '\n'


new, count = pattern.subn(join, text)
new = re.sub(r'\n{3,}', '\n\n', new)
open(path, 'w', encoding='utf-8').write(new)
print(f'{count} conflito(s) resolvido(s)')
