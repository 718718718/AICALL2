import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.NODE_ENV === 'development'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000')
  : process.env.NEXT_PUBLIC_BACKEND_URL_PROD!

// GET /api/call-history/[id]/recording
// バックエンドの録音ダウンロードへ中継する。録音は音声バイナリなので
// JSON化せずそのままストリーミングして返す。
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authorization = request.headers.get('authorization')
    if (!authorization) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      )
    }

    const backendRes = await fetch(
      `${API_BASE_URL}/api/call-history/${id}/recording`,
      {
        method: 'GET',
        headers: { Authorization: authorization },
      }
    )

    // 失敗時はバックエンドが返したJSONエラーをそのまま透過する
    if (!backendRes.ok) {
      const text = await backendRes.text()
      return new NextResponse(text, {
        status: backendRes.status,
        headers: {
          'Content-Type':
            backendRes.headers.get('content-type') || 'application/json',
        },
      })
    }

    // 成功時は音声をそのままストリーミング
    const headers = new Headers()
    headers.set(
      'Content-Type',
      backendRes.headers.get('content-type') || 'audio/wav'
    )
    const disposition = backendRes.headers.get('content-disposition')
    if (disposition) headers.set('Content-Disposition', disposition)
    const length = backendRes.headers.get('content-length')
    if (length) headers.set('Content-Length', length)

    return new NextResponse(backendRes.body, { status: 200, headers })
  } catch (error) {
    console.error('Recording proxy error:', error)
    return NextResponse.json(
      { success: false, error: '録音の取得でエラーが発生しました' },
      { status: 500 }
    )
  }
}
