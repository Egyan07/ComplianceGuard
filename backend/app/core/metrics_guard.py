"""Access control for the Prometheus /metrics endpoint.

Metrics expose service topology (route paths), traffic rates, error rates,
and build info — useful to an attacker sizing up the deployment, so the
endpoint must not be anonymously reachable from the public internet.

Model (mirrors the ALLOWED_HOSTS opt-in design):

- METRICS_ALLOWED_IPS: comma/JSON list of IPs/CIDRs permitted to scrape
  metrics. Unset means "no remote access" — only loopback scrapes are
  served, which covers in-container Prometheus sidecars and local dev.
  Set e.g. METRICS_ALLOWED_IPS=["10.0.0.0/8","192.168.1.5"] to admit an
  internal scraper.

The nginx deployment additionally blocks /metrics at the proxy (see
nginx.conf), so public traffic never reaches this guard; the guard is the
defense-in-depth layer for deployments where the API is reached directly
(desktop mode, a misconfigured proxy, the published :8000 port).
"""

import ipaddress
import json
import os
from typing import List, Optional, Union


def parse_allowed_metrics_ips(raw: Optional[str]) -> Optional[List[Union[ipaddress.IPv4Network, ipaddress.IPv6Network]]]:
    """Parse METRICS_ALLOWED_IPS into a list of IP networks, or None when unset.

    Accepts the JSON array form (pydantic-settings convention) or a plain
    comma-separated string. Individual host IPs are treated as /32 or /128.
    Invalid entries raise ValueError so a typo fails loudly at startup.
    """
    if raw is None:
        return None
    raw = raw.strip()
    if not raw:
        return None
    values: List[str]
    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = [raw]
        values = parsed if isinstance(parsed, list) else [raw]
    else:
        values = raw.split(",")
    networks = []
    for v in values:
        v = str(v).strip()
        if not v:
            continue
        if "/" not in v:
            v = f"{v}/32" if ":" not in v else f"{v}/128"
        networks.append(ipaddress.ip_network(v, strict=False))
    return networks or None


def is_metrics_allowed(client_ip: str, networks) -> bool:
    """True when client_ip is loopback or falls inside an allowed network."""
    try:
        addr = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    if addr.is_loopback:
        return True
    if not networks:
        return False
    return any(addr in net for net in networks)


def get_allowed_networks():
    """Resolve the configured allowlist at request time (test/rotation friendly)."""
    return parse_allowed_metrics_ips(os.getenv("METRICS_ALLOWED_IPS"))
