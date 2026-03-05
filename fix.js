const fs = require('fs');
const file = 'src/components/settings/AdminSystem.tsx';
let text = fs.readFileSync(file, 'utf8');
const lines = text.split('\n');

// Replace lines 1211 to 1410 (0-indexed 1211-1410) with the new header
const before = lines.slice(0, 1211);
const after = lines.slice(1411);
const replacement1 = `            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-white">积分模型配置</h3>
                <p className="text-sm text-gray-400 mt-1">
                  配置积分模型供应商和模型。点击供应商展开详情。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      const { adminModelService } = await import('../../services/model/adminModelService');
                      await adminModelService.forceLoadAdminModels();
                      const { keyManager } = await import('../../services/auth/keyManager');
                      keyManager.clearGlobalModelListCache?.();
                      keyManager.forceNotify?.();
                      loadProviders();
                      notify.success('同步成功', '模型配置已从云端刷新，所有用户将看到最新模型');
                    } catch (err: any) {
                      notify.error('同步失败', err.message);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  <RefreshCw className={\`w-4 h-4 \${isLoading ? 'animate-spin' : ''}\`} />
                  同步刷新
                </button>
                <button
                  onClick={() => startEditing()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  添加供应商
                </button>
              </div>
            </div>`;

let newText = [...before, replacement1, ...after].join('\n');

// Now fix the end logic (lines 1743-1746 in the original, we can just replace text)
newText = newText.replace('        {/* 这是一个包裹 div，原代码最后少了一个闭合，我在这里预留，以免影响外部 */}\n            )}\n      </div>\n        )}', '          </div>\n        )}');
newText = newText.replace('        {/* 这是一个包裹 div，原代码最后少了一个闭合，我在这里预留，以免影响外部 */}\r\n            )}\r\n      </div>\r\n        )}', '          </div>\r\n        )}');

// Fix the color bug 
newText = newText.replace('color: generateRandomColor(),', "color: '#3B82F6',");
newText = newText.replace('gradient: `from-[${generateRandomColor()}] to-blue-500`', "gradient: 'from-blue-500 to-indigo-600',");

fs.writeFileSync(file, newText);
console.log('Done!');
