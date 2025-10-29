from pathlib import Path
from docx import Document


def parse_docx(path: Path) -> str:
    doc = Document(str(path))
    return "\n".join(p.text for p in doc.paragraphs if p.text and p.text.strip())


