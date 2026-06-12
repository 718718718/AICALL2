"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface NavigationItem {
  name: string
  href: string
  children?: NavigationItem[]
}



export function Sidebar() {
  const [isManagementOpen, setIsManagementOpen] = useState(false)
  const [isCompanyManagementOpen, setIsCompanyManagementOpen] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const userData = localStorage.getItem('userData')
    if (userData) {
      try {
        const user = JSON.parse(userData)
        // Check different possible response structures
        const userRole = user.user?.role || user.data?.role || user.role
        setRole(userRole)
        console.log("user role:", userRole)
      } catch (error) {
        console.error("Error parsing user data:", error)
        setRole(null)
      }
    }
  }, [])

  // Auto-expand accordion if a child route is active
  useEffect(() => {
    const companyManagementItem = navigation.find(item => item.name === "企業管理")
    if (companyManagementItem?.children && isChildActive(companyManagementItem.children)) {
      setIsCompanyManagementOpen(true)
    }
  }, [pathname])

  const handleLogout = () => {
    localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken')
    localStorage.removeItem('userData')
    // Always redirect to /login regardless of current location
    router.push("/login")
  }


  const isActive = (path: string) => pathname === path

  const isChildActive = (children: NavigationItem[]) => {
    return children.some(child => pathname === child.href)
  }

  const toggleAccordion = (itemName: string) => {
    if (itemName === "企業管理") {
      setIsCompanyManagementOpen(!isCompanyManagementOpen)
    }
  }


const navigation: NavigationItem[] = [
  { name: "企業一覧", href: "/admin/companies" },
  { name: "ユーザー管理", href: "/admin/users" },
  { name: "企業管理", href: "#", children: [
    { name: "新規登録", href: "/admin/company-management/register" },
    // { name: "ダッシュボード", href: "/admin/company-management/dashboard" },
    // { name: "確認", href: "/admin/company-management/confirm" },
    // { name: "完了", href: "/admin/company-management/complete" },
  ]},
]

  return (
    <div className={`w-64 ${(role==="admin" || pathname.startsWith("/admin"))?"bg-[#00C9D8]":"bg-blue-600"} text-white h-screen fixed left-0 top-0`}>
      {/* ロゴ部分 */}
      <div className="p-4">
        <div className="bg-white p-3 rounded flex items-center justify-center">
          <Image
            src="/logo.jpg"
            alt="Logo"
            width={139}
            height={150}
            className="object-contain"
          />
        </div>
      </div>

      {/* ナビゲーション部分（スクロール可能領域） */}
      <div className="overflow-y-auto" style={{height: 'calc(100vh - 120px)'}}>
        {role==="user"&&<nav className="mt-8">
          <div className="px-4 py-2 text-sm font-medium text-blue-200">顧客管理</div>

          <Link href="/dashboard">
            <div className={`px-6 py-3 hover:bg-blue-700 cursor-pointer ${isActive("/dashboard") ? "bg-blue-700" : ""}`}>
              顧客リスト
            </div>
          </Link>

          <Link href="/call-history">
            <div
              className={`px-6 py-3 hover:bg-blue-700 cursor-pointer ${isActive("/call-history") ? "bg-blue-700" : ""}`}
            >
              コール履歴
            </div>
          </Link>

          <div>
            <div
              className="px-6 py-3 hover:bg-blue-700 cursor-pointer flex items-center justify-between"
              onClick={() => setIsManagementOpen(!isManagementOpen)}
            >
              <span>管理</span>
              {isManagementOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>

            {isManagementOpen && (
              <div className="bg-blue-700">
                <Link href="/user-info">
                  <div
                    className={`px-8 py-2 hover:bg-blue-800 cursor-pointer text-sm ${
                      isActive("/user-info") ? "bg-blue-800" : ""
                    }`}
                  >
                    ユーザー情報
                  </div>
                </Link>
                <Link href="/import">
                  <div
                    className={`px-8 py-2 hover:bg-blue-800 cursor-pointer text-sm ${
                      isActive("/import") ? "bg-blue-800" : ""
                    }`}
                  >
                    顧客情報インポート
                  </div>
                </Link>
                <Link href="/settings/sales-pitch">
                  <div
                    className={`px-8 py-2 hover:bg-blue-800 cursor-pointer text-sm ${
                      isActive("/settings/sales-pitch") ? "bg-blue-800" : ""
                    }`}
                  >
                    トークスクリプト設定
                  </div>
                </Link>
              </div>
            )}
          </div>
        </nav>}

        {/* Admin navigation - Display when role is admin or when on admin pages */}
        {(role === "admin" || pathname.startsWith("/admin")) && (
          <nav className="mt-8 space-y-1 px-4">
            {navigation.map((item) => (
              <div key={item.name}>
                {item.children ? (
                  // Parent item with children (accordion)
                  <div>
                    <div
                      onClick={() => toggleAccordion(item.name)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 text-white hover:bg-cyan-500 rounded cursor-pointer",
                        (item.children && isChildActive(item.children)) && "bg-cyan-500"
                      )}
                    >
                      <span>{item.name}</span>
                      {item.name === "企業管理" ? (
                        isCompanyManagementOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )
                      ) : null}
                    </div>
                    {item.name === "企業管理" && isCompanyManagementOpen && (
                      <div className="ml-4 space-y-1 mt-1">
                        {item.children.map((child, index) => (
                          <Link
                            key={`${child.name}-${index}`}
                            href={child.href}
                            className={cn(
                              "block px-3 py-2 text-white hover:bg-cyan-500 rounded",
                              pathname === child.href && "bg-cyan-500"
                            )}
                          >
                            {child.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  // Regular menu item without children
                  <Link
                    href={item.href}
                    className={cn(
                      "block px-3 py-2 text-white hover:bg-cyan-500 rounded",
                      pathname === item.href && "bg-cyan-500"
                    )}
                  >
                    {item.name}
                  </Link>
                )}
              </div>
            ))}
          </nav>
        )}
      </div>

      {/* ログアウトボタン（画面最下部に固定） */}
      <div className="absolute bottom-0 left-0 w-64 p-4">
        <Button variant="ghost" className={`w-full text-white ${(role=="admin" || pathname.startsWith("/admin"))?"hover:bg-cyan-600":"hover:bg-blue-700"}`} onClick={handleLogout}>
          ログアウト
        </Button>
      </div>
    </div>
  )
}
