import os
import re

def walk(dir):
    for root, dirs, files in os.walk(dir):
        for f in files:
            if f.endswith('.ts') or f.endswith('.tsx'):
                full = os.path.join(root, f)
                with open(full, 'r', encoding='utf-8') as file:
                    content = file.read()
                
                if 'workspaceId' in content:
                    # Target patterns specifically
                    content = re.sub(r',\s*workspaceId:\s*ctx\.workspaceId', '', content)
                    content = re.sub(r'workspaceId:\s*ctx\.workspaceId,\s*', '', content)
                    content = re.sub(r',\s*workspaceId:\s*req\.workspaceId', '', content)
                    content = re.sub(r'workspaceId:\s*req\.workspaceId,\s*', '', content)
                    content = re.sub(r',\s*workspaceId:\s*[\w\.]+', '', content)
                    
                    with open(full, 'w', encoding='utf-8') as file:
                        file.write(content)
                    print('Fixed', full)

walk('d:/Working/corely-next/apps/app/app/api')
