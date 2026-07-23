"""验证 cluster 改进：entities 交集 Union-Find 聚类。"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.graphs.dreaming import _entity_connected_components, _pick_theme, cluster

# 模拟 4 条记忆：
# id=1,2 共享 entity "领导" → 应归为同组
# id=3 entity "妈妈" → 独立
# id=4 无 entities → 独立
items = [
    {"id": 1, "kind": "情绪", "depth": "vulnerable", "content": "被领导批评", "confidence": 0.8, "entities": ["领导", "方案"]},
    {"id": 2, "kind": "情绪", "depth": "vulnerable", "content": "怕领导觉得我不行", "confidence": 0.7, "entities": ["领导", "汇报"]},
    {"id": 3, "kind": "情绪", "depth": "personal", "content": "和妈妈吵架", "confidence": 0.9, "entities": ["妈妈"]},
    {"id": 4, "kind": "情绪", "depth": "vulnerable", "content": "莫名难过", "confidence": 0.6, "entities": []},
]

groups = _entity_connected_components(items)
print(f"groups={len(groups)}")
for g in groups:
    ids = [m["id"] for m in g]
    theme = _pick_theme(g, "情绪")
    print(f"  ids={ids} theme={theme}")

# 验证：id=1,2 应在一组（共享"领导"），id=3 独立，id=4 独立
assert len(groups) == 3, f"Expected 3 groups, got {len(groups)}"
big_group = max(groups, key=len)
assert set(m["id"] for m in big_group) == {1, 2}, f"Expected {{1,2}}, got {set(m['id'] for m in big_group)}"
assert _pick_theme(big_group, "情绪") == "领导"

# 测试完整 cluster 函数（需要 DESCENT_THRESHOLD=2）
state = {
    "user_id": 1,
    "db_session_id": 0,
    "recent_memories": items,
    "clusters": [],
    "descent_results": [],
    "reconcile_count": 0,
    "forget_count": 0,
    "candidates": [],
    "errors": [],
}
result = cluster(state)
print(f"\ncluster() → {len(result['clusters'])} clusters")
for c in result["clusters"]:
    print(f"  theme={c['theme']} ids={c['memory_ids']} avg_conf={c['avg_confidence']:.2f} max_depth={c['max_depth']}")

# 只有 id=1,2 组够阈值（2条），应产出 1 个 cluster
assert len(result["clusters"]) == 1
assert result["clusters"][0]["theme"] == "领导"
assert result["clusters"][0]["memory_ids"] == [1, 2]

print("\n=== CLUSTER IMPROVEMENT VERIFIED ===")
