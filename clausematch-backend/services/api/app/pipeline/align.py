from typing import Iterable, List, Tuple


def anchor_align(en: Iterable[str], de: Iterable[str]) -> List[Tuple[str, str, str]]:
    # index-wise pairing with a simple key
    en_list, de_list = list(en), list(de)
    m = max(len(en_list), len(de_list))
    out: List[Tuple[str, str, str]] = []
    for i in range(m):
        a = en_list[i] if i < len(en_list) else ""
        b = de_list[i] if i < len(de_list) else ""
        out.append((f"clause_{i}", a, b))
    return out


