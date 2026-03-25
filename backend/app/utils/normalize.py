import re


_WS_RE = re.compile(r"\s+")


def normalize_item_name(name: str) -> str:
    """
    Canonical key for item identity (strict whitespace removal):
    - trim
    - remove all whitespace (so 'iphone14' == 'iphone 14' == 'iphone   14')
    - uppercase
    """
    if name is None:
        return ""
    trimmed = name.strip()
    if not trimmed:
        return ""
    return _WS_RE.sub("", trimmed).upper()
