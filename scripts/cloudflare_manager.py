#!/usr/bin/env python3
"""
Cloudflare 管理工具
功能：DNS 管理、缓存清除、状态监控
"""

import os
import sys
from typing import Optional
from cloudflare import Cloudflare
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# ========== 配置 ==========
CF_API_TOKEN = os.getenv("CF_API_TOKEN")  # 从环境变量读取
ZONE_ID = "6e8b3a4638980f182b0c4b89bf99e6da"  # kkai.plus 的区域 ID
ZONE_NAME = "kkai.plus"

# ========== 初始化客户端 ==========
def get_client() -> Cloudflare:
    """初始化 Cloudflare 客户端"""
    if not CF_API_TOKEN:
        print("❌ 错误: 请设置 CF_API_TOKEN 环境变量")
        print("   export CF_API_TOKEN='你的令牌'")
        sys.exit(1)
    return Cloudflare(api_token=CF_API_TOKEN)

# ========== 核心功能 ==========
def test_token():
    """测试 API 令牌是否有效"""
    client = get_client()
    try:
        user = client.user.tokens.verify()
        print("✅ API 令牌有效!")
        print(f"   状态: {user.status}")
        return True
    except Exception as e:
        print(f"❌ 令牌验证失败: {e}")
        return False

def list_dns_records():
    """列出所有 DNS 记录"""
    client = get_client()
    try:
        records = client.dns.records.list(zone_id=ZONE_ID)
        print(f"\n📋 {ZONE_NAME} 的 DNS 记录:")
        print("-" * 60)
        print(f"{'类型':<8} {'名称':<30} {'内容':<30} {'代理':<6}")
        print("-" * 60)
        
        for record in records.result:
            proxied = "🟠" if record.proxied else "⚪"
            name = record.name[:28] if len(record.name) > 28 else record.name
            content = record.content[:28] if len(record.content) > 28 else record.content
            print(f"{record.type:<8} {name:<30} {content:<30} {proxied:<6}")
        print("-" * 60)
        print("🟠 = 已代理 (CDN + 安全)  ⚪ = 仅 DNS")
    except Exception as e:
        print(f"❌ 获取 DNS 记录失败: {e}")

def add_dns_record(record_type: str, name: str, content: str, proxied: bool = True):
    """
    添加 DNS 记录
    
    Args:
        record_type: A, CNAME, MX, TXT 等
        name: 子域名，如 "api" 或 "www"
        content: IP 地址或目标域名
        proxied: 是否开启 Cloudflare 代理
    """
    client = get_client()
    try:
        # 构建完整域名
        full_name = f"{name}.{ZONE_NAME}" if name != "@" else ZONE_NAME
        
        record = client.dns.records.create(
            zone_id=ZONE_ID,
            type=record_type,
            name=full_name,
            content=content,
            proxied=proxied,
            ttl=1  # 1 = Auto
        )
        print(f"✅ 添加成功: {record.result.name}")
        print(f"   类型: {record.result.type}")
        print(f"   内容: {record.result.content}")
        print(f"   代理: {'🟠 开启' if record.result.proxied else '⚪ 关闭'}")
    except Exception as e:
        print(f"❌ 添加失败: {e}")

def delete_dns_record(name: str):
    """删除 DNS 记录（按名称）"""
    client = get_client()
    try:
        # 先查找记录
        records = client.dns.records.list(zone_id=ZONE_ID)
        target = None
        for record in records.result:
            if record.name == name or record.name == f"{name}.{ZONE_NAME}":
                target = record
                break
        
        if not target:
            print(f"❌ 未找到记录: {name}")
            return
        
        # 删除
        client.dns.records.delete(zone_id=ZONE_ID, dns_record_id=target.id)
        print(f"✅ 已删除: {target.name}")
    except Exception as e:
        print(f"❌ 删除失败: {e}")

def purge_cache():
    """清除 CDN 缓存（部署后使用）"""
    client = get_client()
    try:
        client.cache.purge(zone_id=ZONE_ID)
        print("✅ CDN 缓存已清除")
        print("   所有用户将在下次访问时获取最新内容")
    except Exception as e:
        print(f"❌ 清除失败: {e}")

def get_zone_status():
    """获取区域状态概览"""
    client = get_client()
    try:
        zone = client.zones.get(zone_id=ZONE_ID)
        print(f"\n📊 {ZONE_NAME} 状态概览:")
        print("-" * 40)
        print(f"状态: {zone.result.status}")
        print(f"计划: {zone.result.plan.name}")
        print(f"名称服务器: {', '.join(zone.result.name_servers[:2])}")
        
        # SSL 设置
        ssl = client.zones.settings.get(zone_id=ZONE_ID, setting_id="ssl")
        print(f"SSL/TLS 模式: {ssl.result.value}")
        
    except Exception as e:
        print(f"❌ 获取状态失败: {e}")

def toggle_development_mode(enabled: bool):
    """
    开启/关闭开发模式
    开发模式会绕过缓存，方便调试
    """
    client = get_client()
    try:
        value = "on" if enabled else "off"
        client.zones.settings.edit(
            zone_id=ZONE_ID,
            setting_id="development_mode",
            value=value
        )
        status = "开启" if enabled else "关闭"
        print(f"✅ 开发模式已{status}")
        if enabled:
            print("   ⚠️  缓存已禁用，仅用于调试，完成后请关闭")
    except Exception as e:
        print(f"❌ 设置失败: {e}")

# ========== 命令行接口 ==========
def show_help():
    """显示帮助信息"""
    help_text = """
🔧 Cloudflare 管理工具 - 用法:

  python cloudflare_manager.py <命令> [参数]

📋 可用命令:
  test                    - 测试 API 令牌
  list                    - 列出所有 DNS 记录
  status                  - 查看区域状态
  add <类型> <名称> <内容> [代理]  - 添加 DNS 记录
                          代理: true(默认) 或 false
  delete <名称>           - 删除 DNS 记录
  purge                   - 清除 CDN 缓存
  dev <on|off>            - 开启/关闭开发模式

💡 示例:
  # 测试令牌
  python cloudflare_manager.py test

  # 添加 A 记录指向服务器
  python cloudflare_manager.py add A api 1.2.3.4

  # 添加 CNAME 记录
  python cloudflare_manager.py add CNAME www kkai.plus

  # 部署后清除缓存
  python cloudflare_manager.py purge

⚙️  环境变量:
  export CF_API_TOKEN='你的API令牌'
"""
    print(help_text)

def main():
    if len(sys.argv) < 2:
        show_help()
        return
    
    command = sys.argv[1].lower()
    
    if command == "test":
        test_token()
    
    elif command == "list":
        list_dns_records()
    
    elif command == "status":
        get_zone_status()
    
    elif command == "purge":
        purge_cache()
    
    elif command == "add":
        if len(sys.argv) < 5:
            print("❌ 用法: python cloudflare_manager.py add <类型> <名称> <内容> [代理]")
            print("   示例: python cloudflare_manager.py add A api 1.2.3.4")
            return
        record_type = sys.argv[2].upper()
        name = sys.argv[3]
        content = sys.argv[4]
        proxied = sys.argv[5].lower() == "true" if len(sys.argv) > 5 else True
        add_dns_record(record_type, name, content, proxied)
    
    elif command == "delete":
        if len(sys.argv) < 3:
            print("❌ 用法: python cloudflare_manager.py delete <名称>")
            return
        delete_dns_record(sys.argv[2])
    
    elif command == "dev":
        if len(sys.argv) < 3 or sys.argv[2] not in ["on", "off"]:
            print("❌ 用法: python cloudflare_manager.py dev <on|off>")
            return
        toggle_development_mode(sys.argv[2] == "on")
    
    else:
        print(f"❌ 未知命令: {command}")
        show_help()

if __name__ == "__main__":
    main()
