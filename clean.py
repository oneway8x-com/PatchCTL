import os
import re

path = 'd:/Working/corely-next/packages/contracts/src/index.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove invalid single-line exports
valid_dirs = {'ai', 'approvals', 'billing', 'common', 'copilot', 'documents', 'errors', 'forms', 'identity', 'import', 'integrations', 'payment-methods', 'platform', 'shared', 'todos', 'workflows'}

new_lines = []
for line in content.split('\n'):
    if line.startswith('export * from "./'):
        mod = line.split('"')[1]
        base_mod = mod.split('/')[1]
        if base_mod not in valid_dirs:
            continue
    new_lines.append(line)

content = '\n'.join(new_lines)

# Remove multiline exports for pos and sales
content = re.sub(r'export \{\s*RecordPaymentInputSchema as SalesRecordPaymentInputSchema,.*?\} from "\./sales/record-payment\.schema";', '', content, flags=re.DOTALL)
content = re.sub(r'export \{\s*PaymentMethod as PosPaymentMethod,.*?\} from "\./pos/pos-sale\.types";', '', content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated', path)
