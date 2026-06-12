'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Save, 
  Phone, 
  User, 
  Settings, 
  Bell,
  Clock,
  MessageSquare,
  Loader2
} from 'lucide-react';
import { agentAPI } from '@/lib/api';
import { updateAgentStatus } from '@/lib/socket';
import { toast } from 'sonner';

export default function AgentSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    user: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      companyName: ''
    },
    settings: {
      phoneNumber: '',
      isAvailable: true,
      conversationSettings: {
        companyName: '',
        serviceName: '',
        representativeName: '',
        targetDepartment: '営業部',
        customTemplates: {
          initial: '',
          clarification: '',
          company_confirmation: '',
          absent: '',
          rejection: '',
          website_redirect: '',
          closing: '',
          handoff_message: ''
        }
      },
      notificationPreferences: {
        enableCallNotifications: true,
        enableEmailNotifications: false,
        workingHours: {
          start: '09:00',
          end: '18:00',
          timezone: 'Asia/Tokyo'
        }
      }
    },
    status: {
      status: 'offline'
    }
  });

  useEffect(() => {
    fetchAgentProfile();
  }, []);

  const fetchAgentProfile = async () => {
    try {
      const response = await agentAPI.getProfile();
      const data = response.data.data;
      
      setProfile({
        user: data.user || profile.user,
        settings: data.settings || profile.settings,
        status: data.status || profile.status
      });
    } catch (error) {
      console.error('Failed to fetch agent profile:', error);
      toast.error('プロフィールの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBasicInfo = async () => {
    setSaving(true);
    try {
      await agentAPI.updateProfile({
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        email: profile.user.email,
        phone: profile.user.phone
      });
      toast.success('基本情報を更新しました');
    } catch (error) {
      toast.error('基本情報の更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePhoneSettings = async () => {
    setSaving(true);
    try {
      await agentAPI.updatePhone(profile.settings.phoneNumber);
      toast.success('電話番号を更新しました');
    } catch (error) {
      toast.error('電話番号の更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConversationSettings = async () => {
    setSaving(true);
    try {
      await agentAPI.updateConversation(profile.settings.conversationSettings);
      toast.success('会話設定を更新しました');
    } catch (error) {
      toast.error('会話設定の更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotificationSettings = async () => {
    setSaving(true);
    try {
      await agentAPI.updateNotifications(profile.settings.notificationPreferences);
      toast.success('通知設定を更新しました');
    } catch (error) {
      toast.error('通知設定の更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (isAvailable: boolean) => {
    try {
      const newStatus = isAvailable ? 'available' : 'offline';
      await agentAPI.updateStatus(newStatus, isAvailable);
      updateAgentStatus(newStatus);
      
      setProfile(prev => ({
        ...prev,
        settings: { ...prev.settings, isAvailable },
        status: { ...prev.status, status: newStatus }
      }));
      
      toast.success(`ステータスを${isAvailable ? '利用可能' : 'オフライン'}に変更しました`);
    } catch (error) {
      toast.error('ステータスの更新に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">エージェント設定</h1>
        <p className="text-muted-foreground mt-2">
          プロフィールと通話設定を管理します
        </p>
      </div>

      {/* ステータス切り替え */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>利用可能状態</CardTitle>
          <CardDescription>
            通話を受け付けるかどうかを設定します
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={profile.settings.isAvailable}
                onCheckedChange={handleStatusChange}
              />
              <Label>
                {profile.settings.isAvailable ? '利用可能' : 'オフライン'}
              </Label>
            </div>
            <Badge variant={profile.settings.isAvailable ? 'success' : 'secondary'}>
              {profile.status.status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="basic" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">基本情報</TabsTrigger>
          <TabsTrigger value="phone">電話設定</TabsTrigger>
          <TabsTrigger value="conversation">会話設定</TabsTrigger>
          <TabsTrigger value="notifications">通知設定</TabsTrigger>
        </TabsList>

        {/* 基本情報 */}
        <TabsContent value="basic">
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
              <CardDescription>
                あなたのプロフィール情報を管理します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="lastName">姓</Label>
                  <Input
                    id="lastName"
                    value={profile.user.lastName}
                    onChange={(e) => setProfile(prev => ({
                      ...prev,
                      user: { ...prev.user, lastName: e.target.value }
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="firstName">名</Label>
                  <Input
                    id="firstName"
                    value={profile.user.firstName}
                    onChange={(e) => setProfile(prev => ({
                      ...prev,
                      user: { ...prev.user, firstName: e.target.value }
                    }))}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.user.email}
                  onChange={(e) => setProfile(prev => ({
                    ...prev,
                    user: { ...prev.user, email: e.target.value }
                  }))}
                />
              </div>

              <div>
                <Label htmlFor="phone">電話番号</Label>
                <Input
                  id="phone"
                  value={profile.user.phone}
                  onChange={(e) => setProfile(prev => ({
                    ...prev,
                    user: { ...prev.user, phone: e.target.value }
                  }))}
                />
              </div>

              <Button onClick={handleSaveBasicInfo} disabled={saving}>
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 保存中...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> 保存</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 電話設定 */}
        <TabsContent value="phone">
          <Card>
            <CardHeader>
              <CardTitle>電話設定</CardTitle>
              <CardDescription>
                引き継ぎ時に使用する電話番号を設定します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="agentPhone">エージェント電話番号</Label>
                <Input
                  id="agentPhone"
                  placeholder="+81 90-1234-5678"
                  value={profile.settings.phoneNumber}
                  onChange={(e) => setProfile(prev => ({
                    ...prev,
                    settings: { ...prev.settings, phoneNumber: e.target.value }
                  }))}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  通話が引き継がれる際、この番号に着信します
                </p>
              </div>

              <Button onClick={handleSavePhoneSettings} disabled={saving}>
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 保存中...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> 保存</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 会話設定 */}
        <TabsContent value="conversation">
          <Card>
            <CardHeader>
              <CardTitle>会話設定</CardTitle>
              <CardDescription>
                AIが使用する会話テンプレートを設定します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="companyName">会社名</Label>
                  <Input
                    id="companyName"
                    value={profile.settings.conversationSettings.companyName}
                    onChange={(e) => setProfile(prev => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        conversationSettings: {
                          ...prev.settings.conversationSettings,
                          companyName: e.target.value
                        }
                      }
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="serviceName">サービス名</Label>
                  <Input
                    id="serviceName"
                    value={profile.settings.conversationSettings.serviceName}
                    onChange={(e) => setProfile(prev => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        conversationSettings: {
                          ...prev.settings.conversationSettings,
                          serviceName: e.target.value
                        }
                      }
                    }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="representativeName">担当者名</Label>
                  <Input
                    id="representativeName"
                    value={profile.settings.conversationSettings.representativeName}
                    onChange={(e) => setProfile(prev => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        conversationSettings: {
                          ...prev.settings.conversationSettings,
                          representativeName: e.target.value
                        }
                      }
                    }))}
                  />
                </div>
                <div>
                  <Label htmlFor="targetDepartment">対象部署</Label>
                  <Input
                    id="targetDepartment"
                    value={profile.settings.conversationSettings.targetDepartment}
                    onChange={(e) => setProfile(prev => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        conversationSettings: {
                          ...prev.settings.conversationSettings,
                          targetDepartment: e.target.value
                        }
                      }
                    }))}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-lg font-medium mb-4">カスタムテンプレート</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="initialTemplate">初期挨拶</Label>
                    <Textarea
                      id="initialTemplate"
                      rows={3}
                      placeholder="お世話になります。{{companyName}}の{{representativeName}}と申します..."
                      value={profile.settings.conversationSettings.customTemplates?.initial || ''}
                      onChange={(e) => setProfile(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          conversationSettings: {
                            ...prev.settings.conversationSettings,
                            customTemplates: {
                              ...prev.settings.conversationSettings.customTemplates,
                              initial: e.target.value
                            }
                          }
                        }
                      }))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="handoffTemplate">引き継ぎメッセージ</Label>
                    <Textarea
                      id="handoffTemplate"
                      rows={2}
                      placeholder="担当者におつなぎいたします。少々お待ちください。"
                      value={profile.settings.conversationSettings.customTemplates?.handoff_message || ''}
                      onChange={(e) => setProfile(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          conversationSettings: {
                            ...prev.settings.conversationSettings,
                            customTemplates: {
                              ...prev.settings.conversationSettings.customTemplates,
                              handoff_message: e.target.value
                            }
                          }
                        }
                      }))}
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveConversationSettings} disabled={saving}>
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 保存中...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> 保存</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 通知設定 */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>通知設定</CardTitle>
              <CardDescription>
                通知と勤務時間を設定します
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>通話通知</Label>
                    <p className="text-sm text-muted-foreground">
                      新しい通話があった時に通知を受け取る
                    </p>
                  </div>
                  <Switch
                    checked={profile.settings.notificationPreferences.enableCallNotifications}
                    onCheckedChange={(checked) => setProfile(prev => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        notificationPreferences: {
                          ...prev.settings.notificationPreferences,
                          enableCallNotifications: checked
                        }
                      }
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>メール通知</Label>
                    <p className="text-sm text-muted-foreground">
                      重要な更新をメールで受け取る
                    </p>
                  </div>
                  <Switch
                    checked={profile.settings.notificationPreferences.enableEmailNotifications}
                    onCheckedChange={(checked) => setProfile(prev => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        notificationPreferences: {
                          ...prev.settings.notificationPreferences,
                          enableEmailNotifications: checked
                        }
                      }
                    }))}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-lg font-medium mb-4">勤務時間</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="workStart">開始時刻</Label>
                    <Input
                      id="workStart"
                      type="time"
                      value={profile.settings.notificationPreferences.workingHours.start}
                      onChange={(e) => setProfile(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          notificationPreferences: {
                            ...prev.settings.notificationPreferences,
                            workingHours: {
                              ...prev.settings.notificationPreferences.workingHours,
                              start: e.target.value
                            }
                          }
                        }
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="workEnd">終了時刻</Label>
                    <Input
                      id="workEnd"
                      type="time"
                      value={profile.settings.notificationPreferences.workingHours.end}
                      onChange={(e) => setProfile(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          notificationPreferences: {
                            ...prev.settings.notificationPreferences,
                            workingHours: {
                              ...prev.settings.notificationPreferences.workingHours,
                              end: e.target.value
                            }
                          }
                        }
                      }))}
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveNotificationSettings} disabled={saving}>
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 保存中...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> 保存</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}