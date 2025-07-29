import React, { useEffect, useState } from 'react';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { useAuthStore } from '../stores/authStore';
import { CreditCard, Check, Zap, Crown, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

const BillingPage: React.FC = () => {
  const { user } = useAuthStore();
  const {
    plans,
    currentSubscription,
    credits,
    usage,
    payments,
    loading,
    error,
    fetchPlans,
    fetchCurrentSubscription,
    fetchCredits,
    fetchUsage,
    fetchPayments,
    createCheckoutSession,
    purchaseCredits,
    clearError
  } = useSubscriptionStore();

  const [creditAmount, setCreditAmount] = useState(10);
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPlans();
      fetchCurrentSubscription();
      fetchCredits();
      fetchUsage();
      fetchPayments();
    }
  }, [user]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error]);

  const handleSubscribe = async (planId: number) => {
    try {
      setProcessingPayment(true);
      const checkoutUrl = await createCheckoutSession(planId);
      window.location.href = checkoutUrl;
    } catch (error) {
      toast.error('Failed to start checkout process');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handlePurchaseCredits = async () => {
    try {
      setProcessingPayment(true);
      const checkoutUrl = await purchaseCredits(creditAmount);
      window.location.href = checkoutUrl;
    } catch (error) {
      toast.error('Failed to start credit purchase');
    } finally {
      setProcessingPayment(false);
    }
  };

  const getPlanIcon = (planName: string) => {
    switch (planName.toLowerCase()) {
      case 'free':
        return <Zap className="w-6 h-6" />;
      case 'premium':
        return <Crown className="w-6 h-6" />;
      case 'pay-per-message':
        return <DollarSign className="w-6 h-6" />;
      default:
        return <CreditCard className="w-6 h-6" />;
    }
  };

  const getPlanColor = (planName: string) => {
    switch (planName.toLowerCase()) {
      case 'free':
        return 'border-gray-200 bg-white';
      case 'premium':
        return 'border-blue-500 bg-blue-50 ring-2 ring-blue-500';
      case 'pay-per-message':
        return 'border-green-200 bg-green-50';
      default:
        return 'border-gray-200 bg-white';
    }
  };

  if (loading && !plans.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Select the perfect plan for your AI chat needs. Upgrade or downgrade anytime.
          </p>
        </div>

        {/* Current Subscription Status */}
        {currentSubscription && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Current Plan: {currentSubscription.name}
                </h3>
                <p className="text-gray-600">
                  {currentSubscription.billing_cycle === 'monthly' 
                    ? `$${currentSubscription.price}/month` 
                    : currentSubscription.price === 0 
                    ? 'Free' 
                    : `$${currentSubscription.price}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">
                  {currentSubscription.status === 'active' ? 'Active until' : 'Status'}
                </p>
                <p className="font-medium">
                  {currentSubscription.status === 'active'
                    ? new Date(currentSubscription.current_period_end).toLocaleDateString()
                    : currentSubscription.status}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Usage Statistics */}
        {usage && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <Calendar className="w-8 h-8 text-blue-600 mr-3" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Today</p>
                  <p className="text-2xl font-bold text-gray-900">{usage.today.messages_sent}</p>
                  <p className="text-sm text-gray-500">messages</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <TrendingUp className="w-8 h-8 text-green-600 mr-3" />
                <div>
                  <p className="text-sm font-medium text-gray-500">This Month</p>
                  <p className="text-2xl font-bold text-gray-900">{usage.thisMonth.messages_sent}</p>
                  <p className="text-sm text-gray-500">messages</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <DollarSign className="w-8 h-8 text-purple-600 mr-3" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Cost</p>
                  <p className="text-2xl font-bold text-gray-900">${usage.total.cost.toFixed(2)}</p>
                  <p className="text-sm text-gray-500">lifetime</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Credits Display */}
        {credits && (
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200 p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Your Credits
                </h3>
                <p className="text-3xl font-bold text-green-600">
                  {credits.credits.toFixed(0)} credits
                </p>
                <p className="text-sm text-gray-600">
                  Total purchased: {credits.total_purchased.toFixed(0)} | Used: {credits.total_used.toFixed(0)}
                </p>
              </div>
              <div className="text-right">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Purchase Credits ($1 = 100 credits)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(parseInt(e.target.value) || 1)}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">
                    = {creditAmount * 100} credits
                  </span>
                </div>
                <button
                  onClick={handlePurchaseCredits}
                  disabled={processingPayment}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingPayment ? 'Processing...' : `Buy $${creditAmount}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pricing Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-lg border-2 p-8 relative ${getPlanColor(plan.name)}`}
            >
              {plan.name.toLowerCase() === 'premium' && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </span>
                </div>
              )}
              
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  {getPlanIcon(plan.name)}
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <p className="text-gray-600 mb-6">{plan.description}</p>
                
                <div className="mb-6">
                  {plan.price === 0 ? (
                    <span className="text-4xl font-bold text-gray-900">Free</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                      {plan.billing_cycle === 'monthly' && (
                        <span className="text-gray-600">/month</span>
                      )}
                    </>
                  )}
                </div>
                
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center">
                      <Check className="w-5 h-5 text-green-500 mr-3" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={processingPayment || (currentSubscription?.plan_id === plan.id && currentSubscription?.status === 'active')}
                  className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
                    currentSubscription?.plan_id === plan.id && currentSubscription?.status === 'active'
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      : plan.name.toLowerCase() === 'premium'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {processingPayment
                    ? 'Processing...'
                    : currentSubscription?.plan_id === plan.id && currentSubscription?.status === 'active'
                    ? 'Current Plan'
                    : plan.price === 0
                    ? 'Get Started'
                    : 'Subscribe Now'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {payments.slice(0, 10).map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(payment.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {payment.description || payment.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${payment.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          payment.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : payment.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BillingPage;