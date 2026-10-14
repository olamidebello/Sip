#!/usr/bin/env python3
import re,sys
from pathlib import Path
text=Path(sys.argv[1]).read_text()
# Use the bootstrap database owner for upstream triggers, instead of an absent localhost account.
text=re.sub(r'DEFINER=`[^`]+`@`[^`]+`', '', text)
sys.stdout.write(text)
