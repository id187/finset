"""Browser-only transport entry. No user input is saved or sent to a server."""
import json
import sys
import browser_source

# Substitute only the audited data-access seam before importing the vendor core.
# All recommendation, eligibility, question and money calculations stay intact.
sys.modules['source'] = browser_source
import core_runtime


def execute_json(raw):
    try:
        return json.dumps({'ok': True, 'data': core_runtime.execute(json.loads(raw))}, ensure_ascii=False)
    except ValueError as error:
        return json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False)
