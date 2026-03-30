"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Store {
  id: string;
  sellerId: string;
  name?: string;
  storeUrl: string;
  notes: string;
  productCount?: number;
  estimatedRevenue?: number;
}

interface Product {
  id: string;
  imageUrl: string;
  title: string;
  asin: string;
  price: number;
  rating: number;
  reviewCount: number;
  bsr: number;
  category: string;
  monthlyRevenue: number;
}

const SEED_STORES = [
  { sellerId: "A35JSZW7PWEAYK", storeUrl: "https://www.amazon.com.au/s?me=A35JSZW7PWEAYK&marketplaceID=A39IBJ37TRP1C6", notes: "朋友店铺参考" },
  { sellerId: "A1BJZUM7RTLM3C", storeUrl: "https://www.amazon.com.au/s?me=A1BJZUM7RTLM3C&marketplaceID=A39IBJ37TRP1C6", notes: "朋友店铺参考" },
  { sellerId: "A17S7MW3FKYP7A", storeUrl: "https://www.amazon.com.au/s?me=A17S7MW3FKYP7A&marketplaceID=A39IBJ37TRP1C6", notes: "朋友店铺参考" },
  { sellerId: "A1PS27S3CG7TP5", storeUrl: "https://www.amazon.com.au/s?me=A1PS27S3CG7TP5&marketplaceID=A39IBJ37TRP1C6", notes: "朋友店铺参考" },
  { sellerId: "A1ZV4NBTHBAI40", storeUrl: "https://www.amazon.com.au/s?me=A1ZV4NBTHBAI40&marketplaceID=A39IBJ37TRP1C6", notes: "朋友店铺参考" },
  { sellerId: "A1ZBQE5ZK58ED7", storeUrl: "https://www.amazon.com.au/s?me=A1ZBQE5ZK58ED7&marketplaceID=A39IBJ37TRP1C6", notes: "朋友店铺参考" },
  { sellerId: "A1ABY58UTHZ987", storeUrl: "https://www.amazon.com.au/s?me=A1ABY58UTHZ987&marketplaceID=A39IBJ37TRP1C6", notes: "朋友店铺参考" },
  { sellerId: "A2G7ORU8CKX823", storeUrl: "https://www.amazon.com.au/s?me=A2G7ORU8CKX823&marketplaceID=A39IBJ37TRP1C6", notes: "朋友店铺参考" },
];

export function TabCompetitors() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [seedingStores, setSeedingStores] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("monthlyRevenue");
  const [addStoreOpen, setAddStoreOpen] = useState(false);
  const [storeUrl, setStoreUrl] = useState("");
  const [notes, setNotes] = useState("");

  const fetchStores = useCallback(async () => {
    setLoadingStores(true);
    try {
      const res = await fetch("/api/au-target/stores");
      if (res.ok) {
        const data = await res.json();
        setStores(data);
      }
    } catch (err) {
      console.error("Failed to fetch stores:", err);
    } finally {
      setLoadingStores(false);
    }
  }, []);

  const fetchProducts = useCallback(async (storeId: string) => {
    setLoadingProducts(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter && categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }
      params.set("sortBy", sortBy);
      const res = await fetch(
        `/api/au-target/stores/${storeId}/products?${params.toString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoadingProducts(false);
    }
  }, [categoryFilter, sortBy]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    if (selectedStoreId) {
      fetchProducts(selectedStoreId);
    }
  }, [selectedStoreId, fetchProducts]);

  const handleAddStore = async () => {
    const match = storeUrl.match(/[?&]me=([A-Z0-9]+)/);
    if (!match) {
      alert("无法从URL中解析出Seller ID，请检查URL格式");
      return;
    }
    const sellerId = match[1];
    try {
      const res = await fetch("/api/au-target/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId, storeUrl, notes }),
      });
      if (res.ok) {
        setStoreUrl("");
        setNotes("");
        setAddStoreOpen(false);
        fetchStores();
      }
    } catch (err) {
      console.error("Failed to add store:", err);
    }
  };

  const handleDeleteStore = async (storeId: string) => {
    try {
      const res = await fetch(`/api/au-target/stores/${storeId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (selectedStoreId === storeId) {
          setSelectedStoreId(null);
          setProducts([]);
        }
        fetchStores();
      }
    } catch (err) {
      console.error("Failed to delete store:", err);
    }
  };

  const handleSeedStores = async () => {
    setSeedingStores(true);
    try {
      for (const store of SEED_STORES) {
        await fetch("/api/au-target/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(store),
        });
      }
      await fetchStores();
    } catch (err) {
      console.error("Failed to seed stores:", err);
    } finally {
      setSeedingStores(false);
    }
  };

  const uniqueCategories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean))
  );

  const formatRevenue = (value?: number) => {
    if (value == null) return "—";
    return `A$${value.toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Top section: Store cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">竞品店铺</h3>
          <Button size="sm" onClick={() => setAddStoreOpen(true)}>添加店铺</Button>
          <Dialog open={addStoreOpen} onOpenChange={setAddStoreOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加竞品店铺</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="storeUrl">店铺链接</Label>
                  <Input
                    id="storeUrl"
                    placeholder="https://www.amazon.com.au/s?me=XXXXX..."
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">备注</Label>
                  <Textarea
                    id="notes"
                    placeholder="备注信息..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <Button onClick={handleAddStore} className="w-full">
                  确认添加
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loadingStores ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : stores.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-sm text-muted-foreground">暂无竞品店铺数据</p>
            <Button onClick={handleSeedStores} disabled={seedingStores}>
              {seedingStores ? "导入中..." : "导入参考店铺"}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stores.map((store) => (
              <Card
                key={store.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedStoreId === store.id
                    ? "ring-2 ring-amber-500"
                    : ""
                }`}
                onClick={() => setSelectedStoreId(store.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-medium">
                      {store.name || store.sellerId}
                    </CardTitle>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteStore(store.id);
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">产品数</span>
                    <span>{store.productCount ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">预估营收</span>
                    <span>{formatRevenue(store.estimatedRevenue)}</span>
                  </div>
                  {store.notes && (
                    <div className="pt-1">
                      <Badge variant="secondary" className="text-xs">
                        {store.notes}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Bottom section: Products table */}
      {selectedStoreId && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="全部品类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部品类</SelectItem>
                {uniqueCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v ?? "monthlyRevenue")}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthlyRevenue">预估月销</SelectItem>
                <SelectItem value="price">价格</SelectItem>
                <SelectItem value="rating">评分</SelectItem>
                <SelectItem value="reviewCount">评价数</SelectItem>
                <SelectItem value="bsr">BSR</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loadingProducts ? (
            <div className="text-sm text-muted-foreground">加载产品数据...</div>
          ) : products.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              暂无产品数据
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">图片</TableHead>
                    <TableHead>标题</TableHead>
                    <TableHead>ASIN</TableHead>
                    <TableHead className="text-right">价格(AUD)</TableHead>
                    <TableHead className="text-right">评分</TableHead>
                    <TableHead className="text-right">评价数</TableHead>
                    <TableHead className="text-right">BSR</TableHead>
                    <TableHead>品类</TableHead>
                    <TableHead className="text-right">预估月销</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted" />
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-[200px] truncate"
                        title={product.title}
                      >
                        {product.title}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {product.asin}
                      </TableCell>
                      <TableCell className="text-right">
                        A${product.price?.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.rating}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.reviewCount?.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.bsr?.toLocaleString()}
                      </TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell className="text-right">
                        {formatRevenue(product.monthlyRevenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
