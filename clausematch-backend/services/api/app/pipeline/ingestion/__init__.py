from pathlib import Path
from .parser_pdf import parse_pdf
from .parser_docx import parse_docx
from .parser_xlsx import parse_xlsx
from .parser_json import parse_json
from .parser_pptx import parse_pptx


def parse_document(path: Path, lang: str = "en") -> str:
    suffix = path.suffix.lower()
    if suffix in [".pdf"]:
        return parse_pdf(path)
    if suffix in [".doc", ".docx"]:
        return parse_docx(path)
    if suffix in [".xls", ".xlsx"]:
        return parse_xlsx(path)
    if suffix in [".json"]:
        return parse_json(path)
    if suffix in [".ppt", ".pptx"]:
        return parse_pptx(path)
    # default: read as text
    return Path(path).read_text(encoding="utf-8", errors="ignore")


