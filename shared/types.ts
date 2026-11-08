export type Role = 'owner' | 'staff';
export interface User { id: string; name: string; email: string; role: Role }
export interface Variant { id: string; name: string; sku: string; price: number; originalPrice?: number; stock: number }
export interface Product { id: string; slug: string; name: string; category: string; description: string; image: string; images?: string[]; badge?: string; featured: boolean; active: boolean; variants: Variant[]; revision?: number }
export interface Settings { storeName: string; tagline: string; phone: string; email: string; address: string; companyName: string; taxCode: string; heroTitle: string; heroSubtitle: string; heroImage: string; heroEnabled: boolean; shippingFee: number; freeShippingThreshold: number; bankInfo: string; policies?: Record<string, string> }
export type OrderStatus = 'pending' | 'confirmed' | 'packing' | 'shipping' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
export interface Customer { name: string; phone: string; email?: string; address: string; note?: string }
export interface OrderItem { variantId: string; productName: string; variantName: string; image: string; sku: string; price: number; quantity: number }
export interface Order { id: string; code: string; customer: Customer; items: OrderItem[]; subtotal: number; shippingFee: number; total: number; status: OrderStatus; paymentStatus: PaymentStatus; paymentMethod: 'cod' | 'bank'; createdAt: string; updatedAt: string }
export interface Dashboard { summary: { totalOrders: number; pendingOrders: number; revenue: number; lowStockProducts: number }; recentOrders: Order[] }
