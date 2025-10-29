from typing import Iterable, List, Tuple


def embed_align(en: Iterable[str], de: Iterable[str]) -> List[Tuple[str, str, str]]:
    # Fallback: empty alignment
    return []


def llm_check(a_txt: str, b_txt: str, fa, fb) -> List[dict]:
    # Stub: no mismatches
    return []


