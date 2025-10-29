from typing import Dict, List
from . import storage


def render_pdf(job_id: str, findings: List[Dict], summary: Dict) -> str:
    # Dev stub: write HTML summary and return its URL
    html = ["<html><body>", "<h1>ClauseMatch++ Report</h1>"]
    html.append(f"<p>OK: {summary.get('ok',0)} REVIEW: {summary.get('review',0)} MISMATCH: {summary.get('mismatch',0)}</p>")
    html.append("<table border='1' cellspacing='0' cellpadding='4'>")
    html.append("<tr><th>Clause</th><th>Status</th><th>Field</th><th>Risk</th><th>Confidence</th></tr>")
    for f in findings[:200]:
        html.append(
            f"<tr><td>{f.get('clause_key','')}</td><td>{f.get('status','')}</td><td>{f.get('field','')}</td><td>{f.get('risk','')}</td><td>{f.get('confidence','')}</td></tr>"
        )
    html.append("</table></body></html>")
    path = storage.put_json(f"{job_id}/dummy.json", {"_": "placeholder"})  # ensure folder exists
    url_base = storage.url_for(f"{job_id}")
    # Write HTML next to JSON
    from os import path as osp
    html_path = osp.join(osp.dirname(path), "report.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write("\n".join(html))
    return f"{url_base}/report.html"


