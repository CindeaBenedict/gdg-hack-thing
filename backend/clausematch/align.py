from typing import Dict, List


def align_segments(src_segments: List[str], tgt_segments: List[str]) -> List[Dict]:
    # Minimal baseline: index-wise pairing, pad shorter list
    max_len = max(len(src_segments), len(tgt_segments))
    pairs: List[Dict] = []
    for i in range(max_len):
        pairs.append(
            {
                "index": i,
                "source": src_segments[i] if i < len(src_segments) else "",
                "target": tgt_segments[i] if i < len(tgt_segments) else "",
            }
        )
    return pairs


