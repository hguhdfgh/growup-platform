var supabaseUrl = localStorage.getItem('supabaseUrl') || 'https://kqjdxeepusiipewwlzxs.supabase.co'
var supabaseKey = localStorage.getItem('supabaseKey') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxamR4ZWVwdXNpaXBld3dsenhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjA3NjgsImV4cCI6MjA5ODMzNjc2OH0.n3dVbCX-8Veyd3levBepO0CHtaCFqRJDj-ns7IiUkx0'
var supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxamR4ZWVwdXNpaXBld3dsenhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjc2MDc2OCwiZXhwIjoyMDk4MzM2NzY4fQ.FrFBFi1ggo4PJMtvjubr8K5PSjuaV57_dks8AHERM60'
var supabase = window.supabase.createClient(supabaseUrl, supabaseServiceKey)

const loginAttempts = {}
function checkLoginRateLimit(email) {
  const now = Date.now()
  const attempts = loginAttempts[email] || []
  const recent = attempts.filter(t => now - t < 60000)
  if (recent.length >= 5) return false
  recent.push(now)
  loginAttempts[email] = recent
  return true
}

function apiResponse(error, data = null) {
  if (error) {
    console.error(error)
    return { data: null, error }
  }
  return { data, error: null }
}

async function generateOrderNumber() {
  try {
    var today = new Date()
    var year = today.getFullYear()
    var dateStr = today.toISOString().slice(0, 10)

    var { data: seqData, error: seqError } = await supabase
      .from('order_sequences')
      .upsert({ date: dateStr }, { onConflict: 'date' })
      .select()
      .single()

    if (seqError && seqError.code !== 'PGRST116') {
      var { count, error: countError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${year}-01-01`)
        .lt('created_at', `${year + 1}-01-01`)

      if (!countError) {
        var seq = String(count + 1).padStart(4, '0')
        return apiResponse(null, `ORD-${year}-${seq}`)
      }
    }

    if (seqData) {
      var { data: updated, error: updError } = await supabase
        .rpc('increment_sequence', { row_date: dateStr })

      if (!updError && updated) {
        var seq = String(updated).padStart(4, '0')
        return apiResponse(null, `ORD-${year}-${seq}`)
      }

      var nextSeq = (seqData.sequence || 0) + 1
      await supabase
        .from('order_sequences')
        .update({ sequence: nextSeq })
        .eq('date', dateStr)

      var seq = String(nextSeq).padStart(4, '0')
      return apiResponse(null, `ORD-${year}-${seq}`)
    }

    var { count, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01`)
      .lt('created_at', `${year + 1}-01-01`)

    var seq = String((count || 0) + 1).padStart(4, '0')
    return apiResponse(countError, `ORD-${year}-${seq}`)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function signIn(email, password) {
  try {
    if (!checkLoginRateLimit(email)) {
      return apiResponse(new Error('Too many login attempts. Try again in 60 seconds.'))
    }
    var { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function signOut() {
  try {
    var { error } = await supabase.auth.signOut()
    return apiResponse(error, true)
  } catch (err) {
    return apiResponse(err)
  }
}

async function getSession() {
  try {
    var { data, error } = await supabase.auth.getSession()
    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function getCurrentUser() {
  try {
    var { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiResponse(authError || new Error('No user'))

    var { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    return apiResponse(profileError, { ...user, profile: profile || null })
  } catch (err) {
    return apiResponse(err)
  }
}

function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
}

var getProfiles = async function () {
  try {
    var { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['admin', 'support'])
      .order('full_name', { ascending: true })
    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

// â”€â”€ ORDERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getOrders(filters = {}) {
  try {
    let query = supabase
      .from('orders')
      .select('*, customers(full_name, email, phone), products(name, price)', { count: 'exact' })

    if (filters.status) {
      query = query.eq('status', filters.status)
    }
    if (filters.search) {
      var term = `%${(filters.search || '').replace(/%/g, '')}%`
      query = query.or(`order_number.ilike.${term},customer_name.ilike.${term}`)
    }
    if (filters.customerId) {
      query = query.eq('customer_id', filters.customerId)
    }

    query = query.order('created_at', { ascending: false })

    if (filters.page && filters.pageSize) {
      var from = (filters.page - 1) * filters.pageSize
      var to = from + filters.pageSize - 1
      query = query.range(from, to)
    } else if (filters.range) {
      query = query.range(filters.range[0], filters.range[1])
    }

    var { data, error } = await query
    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function getOrder(id) {
  try {
    var { data, error } = await supabase
      .from('orders')
      .select('*, customers(*), products(*)')
      .eq('id', id)
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function createOrder(data) {
  try {
    var { data: orderNum, error: numError } = await generateOrderNumber()
    if (numError) return apiResponse(numError)

    var { data: order, error } = await supabase
      .from('orders')
      .insert({
        order_number: orderNum,
        customer_id: data.customer_id,
        product_id: data.product_id,
        customer_name: data.customer_name || '',
        email: data.email || '',
        phone: data.phone || '',
        amount: data.amount,
        payment_method: data.payment_method || 'baridimob',
        payment_proof_url: data.payment_proof_url || '',
        status: data.status || 'pending',
        notes: data.notes || '',
        admin_notes: data.admin_notes || '',
      })
      .select()
      .single()

    if (error) return apiResponse(error)

    var { data: userData } = await supabase.auth.getUser()

    await addTimelineEntry(order.id, 'created', `Order ${orderNum} created`, userData?.user?.id || null)

    return apiResponse(null, order)
  } catch (err) {
    return apiResponse(err)
  }
}

async function updateOrder(id, data) {
  try {
    var updateFields = {}
    var allowed = ['customer_id', 'product_id', 'amount', 'status', 'notes', 'customer_name', 'email', 'phone', 'payment_method', 'payment_proof_url', 'admin_notes', 'delivery_date', 'assigned_to']
    allowed.forEach(f => {
      if (data[f] !== undefined) updateFields[f] = data[f]
    })
    updateFields.updated_at = new Date().toISOString()

    var { data: order, error } = await supabase
      .from('orders')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    if (error) return apiResponse(error)

    var { data: userData } = await supabase.auth.getUser()
    await addTimelineEntry(id, 'updated', `Order ${order.order_number} updated`, userData?.user?.id || null)

    return apiResponse(null, order)
  } catch (err) {
    return apiResponse(err)
  }
}

async function deleteOrder(id) {
  try {
    var { data: order, error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, order)
  } catch (err) {
    return apiResponse(err)
  }
}

async function approveOrder(id) {
  try {
    var { data: order, error } = await supabase
      .from('orders')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return apiResponse(error)

    var { data: userData } = await supabase.auth.getUser()

    await addTimelineEntry(id, 'approved', `Order ${order.order_number} approved`, userData?.user?.id || null)

    return apiResponse(null, order)
  } catch (err) {
    return apiResponse(err)
  }
}

async function rejectOrder(id, reason) {
  try {
    var { data: order, error } = await supabase
      .from('orders')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return apiResponse(error)

    var { data: userData } = await supabase.auth.getUser()
    await addTimelineEntry(id, 'rejected', `Order ${order.order_number} rejected: ${reason}`, userData?.user?.id || null)

    return apiResponse(null, order)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ ORDER TIMELINE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getOrderTimeline(orderId) {
  try {
    var { data, error } = await supabase
      .from('order_timeline')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function addTimelineEntry(orderId, action, description, performedBy) {
  try {
    var { data, error } = await supabase
      .from('order_timeline')
      .insert({
        order_id: orderId,
        action,
        description,
        performed_by: performedBy || null,
      })
      .select()
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ CUSTOMERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getCustomers(filters = {}) {
  try {
    let query = supabase.from('customers').select('*', { count: 'exact' })

    if (filters.search) {
      var term = `%${(filters.search || '').replace(/%/g, '')}%`
      query = query.or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }
    if (filters.source) {
      query = query.eq('source', filters.source)
    }

    query = query.order('created_at', { ascending: false })

    if (filters.page && filters.pageSize) {
      var from = (filters.page - 1) * filters.pageSize
      var to = from + filters.pageSize - 1
      query = query.range(from, to)
    }

    var { data, error } = await query
    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function getCustomer(id) {
  try {
    var { data: customer, error: custError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()

    if (custError) return apiResponse(custError)

    var { data: orders, error: ordError } = await supabase
      .from('orders')
      .select('*, products(name)')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })

    return apiResponse(ordError, { ...customer, orders: orders || [] })
  } catch (err) {
    return apiResponse(err)
  }
}

async function createCustomer(data) {
  try {
    var { data: customer, error } = await supabase
      .from('customers')
      .insert({
        full_name: data.full_name,
        email: data.email,
        phone: data.phone || '',
        country: data.country || '',
        city: data.city || '',
        notes: data.notes || '',
        source: data.source || 'direct',
        status: data.status || 'active',
      })
      .select()
      .single()

    return apiResponse(error, customer)
  } catch (err) {
    return apiResponse(err)
  }
}
async function updateCustomer(id, data) {
  try {
    var updateFields = {}
    var allowed = ['full_name', 'email', 'phone', 'country', 'city', 'notes', 'status', 'tags', 'source']
    allowed.forEach(f => {
      if (data[f] !== undefined) updateFields[f] = data[f]
    })
    updateFields.updated_at = new Date().toISOString()

    var { data: customer, error } = await supabase
      .from('customers')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, customer)
  } catch (err) {
    return apiResponse(err)
  }
}

async function deleteCustomer(id) {
  try {
    var { data, error } = await supabase
      .from('customers')
      .update({ status: 'deleted', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ PRODUCTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getProducts(activeOnly = false, filters = {}) {
  try {
    let query = supabase.from('products').select('*', { count: 'exact' })
    if (activeOnly) query = query.eq('is_active', true)
    query = query.order('name', { ascending: true })
    if (filters.page && filters.pageSize) {
      var from = (filters.page - 1) * filters.pageSize
      var to = from + filters.pageSize - 1
      query = query.range(from, to)
    }
    var { data, error } = await query
    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function getProduct(id) {
  try {
    var { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function createProduct(data) {
  try {
    var { data: product, error } = await supabase
      .from('products')
      .insert({
        name: data.name,
        slug: data.slug || '',
        description: data.description || '',
        price: data.price,
        warranty_months: data.warranty_months || 0,
        images: data.images || [],
        video_url: data.video_url || '',
        features: data.features || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
        is_featured: data.is_featured || false,
        sort_order: data.sort_order || 0,
      })
      .select()
      .single()

    return apiResponse(error, product)
  } catch (err) {
    return apiResponse(err)
  }
}

async function updateProduct(id, data) {
  try {
    var updateFields = {}
    var allowed = ['name', 'slug', 'description', 'price', 'warranty_months', 'images', 'video_url', 'features', 'is_active', 'is_featured', 'sort_order']
    allowed.forEach(f => {
      if (data[f] !== undefined) updateFields[f] = data[f]
    })
    updateFields.updated_at = new Date().toISOString()

    var { data: product, error } = await supabase
      .from('products')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, product)
  } catch (err) {
    return apiResponse(err)
  }
}

async function deleteProduct(id) {
  try {
    var { data, error } = await supabase
      .from('products')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ REVIEWS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getReviews(filters = {}) {
  try {
    let query = supabase.from('reviews').select('*', { count: 'exact' })

    if (filters.status === 'approved' || filters.status === 'rejected') {
      query = filters.status === 'approved' ? query.eq('is_approved', true) : query.eq('is_approved', false)
    }
    if (filters.productId) {
      query = query.eq('product_id', filters.productId)
    }
    if (filters.rating) {
      query = query.eq('rating', filters.rating)
    }

    query = query.order('created_at', { ascending: false })

    if (filters.page && filters.pageSize) {
      var from = (filters.page - 1) * filters.pageSize
      var to = from + filters.pageSize - 1
      query = query.range(from, to)
    }

    var { data, error } = await query
    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function createReview(data) {
  try {
    var { data: review, error } = await supabase
      .from('reviews')
      .insert({
        customer_name: data.customer_name || '',
        customer_city: data.customer_city || '',
        customer_avatar: data.customer_avatar || '',
        rating: data.rating,
        review_text: data.review_text || '',
        is_approved: data.is_approved !== undefined ? data.is_approved : false,
        order_number: data.order_number || '',
      })
      .select()
      .single()

    return apiResponse(error, review)
  } catch (err) {
    return apiResponse(err)
  }
}

async function updateReview(id, data) {
  try {
    var updateFields = {}
    var allowed = ['rating', 'review_text', 'customer_name', 'customer_city', 'customer_avatar', 'is_approved', 'is_pinned', 'order_number']
    allowed.forEach(f => {
      if (data[f] !== undefined) updateFields[f] = data[f]
    })
    updateFields.updated_at = new Date().toISOString()

    var { data: review, error } = await supabase
      .from('reviews')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, review)
  } catch (err) {
    return apiResponse(err)
  }
}

async function deleteReview(id) {
  try {
    var { data, error } = await supabase
      .from('reviews')
      .delete()
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function approveReview(id) {
  try {
    var { data, error } = await supabase
      .from('reviews')
      .update({ is_approved: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function pinReview(id) {
  try {
    var { data: current, error: getError } = await supabase
      .from('reviews')
      .select('is_pinned')
      .eq('id', id)
      .single()

    if (getError) return apiResponse(getError)

    var { data, error } = await supabase
      .from('reviews')
      .update({ is_pinned: !current?.is_pinned, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ FAQ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getFaqs(activeOnly = false, category) {
  try {
    let query = supabase.from('faq').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }
    if (category) {
      query = query.eq('category', category)
    }

    var { data, error } = await query
    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function createFaq(data) {
  try {
    var { data: maxOrder } = await supabase
      .from('faq')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    var sortOrder = (maxOrder && maxOrder[0]?.sort_order != null) ? maxOrder[0].sort_order + 1 : 0

    var { data: faq, error } = await supabase
      .from('faq')
      .insert({
        question: data.question,
        answer: data.answer,
        category: data.category || 'general',
        sort_order: data.sort_order != null ? data.sort_order : sortOrder,
        is_active: data.is_active !== undefined ? data.is_active : true,
      })
      .select()
      .single()

    return apiResponse(error, faq)
  } catch (err) {
    return apiResponse(err)
  }
}

async function updateFaq(id, data) {
  try {
    var updateFields = {}
    var allowed = ['question', 'answer', 'category', 'sort_order', 'is_active']
    allowed.forEach(f => {
      if (data[f] !== undefined) updateFields[f] = data[f]
    })
    updateFields.updated_at = new Date().toISOString()

    var { data: faq, error } = await supabase
      .from('faq')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, faq)
  } catch (err) {
    return apiResponse(err)
  }
}

async function deleteFaq(id) {
  try {
    var { data, error } = await supabase
      .from('faq')
      .delete()
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function reorderFaq(ids) {
  try {
    var updates = ids.map((id, index) => ({
      id,
      sort_order: index,
      updated_at: new Date().toISOString(),
    }))

    var { data, error } = await supabase.from('faq').upsert(updates).select()
    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ LANDING CONTENT (CMS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getLandingContent(section) {
  try {
    var { data, error } = await supabase
      .from('landing_content')
      .select('content')
      .eq('section', section)
      .single()

    return apiResponse(error, data?.content || null)
  } catch (err) {
    return apiResponse(err)
  }
}

async function updateLandingContent(section, content) {
  try {
    var { data, error } = await supabase
      .from('landing_content')
      .upsert({
        section,
        content,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'section' })
      .select()
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ ANALYTICS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getDashboardStats() {
  try {
    var { data, error } = await supabase.rpc('get_dashboard_stats')
    if (!error && data) return apiResponse(null, data)
  } catch (e) {}
  try {
    var thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    var ordersQuery = supabase.from('orders').select('status,amount').gte('created_at', thirtyDaysAgo)
    var customersQuery = supabase.from('customers').select('id', { count: 'exact', head: true })
    var todayOrdersQuery = supabase.from('orders').select('status,amount').gte('created_at', new Date().toISOString().slice(0, 10))
    var ordersRes = await ordersQuery, custRes = await customersQuery, todayOrdersRes = await todayOrdersQuery
    var orders = ordersRes.data || []
    var custCount = custRes.count || 0
    var todayOrders = todayOrdersRes.data || []
    var pending = orders.filter(function(o) { return o.status === 'pending' })
    var approvedDelivered = orders.filter(function(o) { return o.status === 'approved' || o.status === 'delivered' })
    var revenue = approvedDelivered.reduce(function(s, o) { return s + Number(o.amount || 0) }, 0)
    var todayRev = todayOrders.filter(function(o) { return o.status === 'approved' || o.status === 'delivered' }).reduce(function(s, o) { return s + Number(o.amount || 0) }, 0)
    return apiResponse(null, { revenue_total: revenue, orders_total: orders.length, customers_total: custCount, conversion_rate: 0, today_orders: todayOrders.length, today_revenue: todayRev, pending_orders: pending.length })
  } catch (err) {
    return apiResponse(err, { revenue_total: 0, orders_total: 0, customers_total: 0, conversion_rate: 0, today_orders: 0, today_revenue: 0, pending_orders: 0 })
  }
}

async function getDashboardStatsYesterday() {
  try {
    var yesterdayStr=new Date(Date.now()-86400000).toISOString();
    var beforeOrdersQuery=supabase.from('orders').select('status,amount').lt('created_at',yesterdayStr);
    var beforeCustomersQuery=supabase.from('customers').select('id').lt('created_at',yesterdayStr);
    var beforeOrders=await beforeOrdersQuery,beforeCust=await beforeCustomersQuery;
    var prevOrders=beforeOrders.data||[];
    var prevCust=beforeCust.data?beforeCust.data.length:0;
    var prevPending=prevOrders.filter(function(o){return o.status==='pending'});
    var prevRev=prevOrders.filter(function(o){return o.status==='approved'||o.status==='delivered'}).reduce(function(s,o){return s+Number(o.amount||0)},0);
    return apiResponse(null, {orders_total:prevOrders.length,pending_orders:prevPending.length,customers_total:prevCust,revenue_total:prevRev})
  } catch (err) {
    return apiResponse(err)
  }
}

async function getMonthlyRevenue(year) {
  try {
    var { data, error } = await supabase.rpc('get_monthly_revenue', { year: year || new Date().getFullYear() })
    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function getTopProducts(limit = 5) {
  try {
    var { data, error } = await supabase.rpc('get_top_products', { p_limit: limit })
    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function getRecentOrders(limit = 10) {
  try {
    var { data, error } = await supabase
      .from('orders')
      .select('*, customers(full_name, email), products(name)')
      .order('created_at', { ascending: false })
      .limit(limit)

    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function getAnalyticsEvents(type, from, to) {
  try {
    let query = supabase
      .from('analytics_events')
      .select('*')
      .order('created_at', { ascending: false })

    if (type) query = query.eq('event_type', type)
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lte('created_at', to)

    var { data, error } = await query
    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function getSalesTrend(from,to){
  try{
    var query=supabase.from('orders').select('created_at,amount').gte('created_at',from||new Date(Date.now()-30*86400000).toISOString()).lte('created_at',to||new Date().toISOString()).order('created_at',{ascending:true});
    var {data,error}=await query;
    if(error)return apiResponse(error,[]);
    var daily={};
    (data||[]).forEach(function(o){
      var day=o.created_at?.slice(0,10);
      if(day){daily[day]=(daily[day]||0)+Number(o.amount||0);}
    });
    var result=Object.entries(daily).map(function(kv){return{date:kv[0],revenue:kv[1]}}).sort(function(a,b){return a.date.localeCompare(b.date)});
    return apiResponse(null,result);
  }catch(err){return apiResponse(err,[]);}
}

async function getOrderStatusDistribution() {
  try {
    var statuses = ['pending', 'approved', 'rejected', 'delivered', 'archived']
    var promises = statuses.map(function(s) {
      return supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', s)
    })
    var results = await Promise.all(promises)
    var counts = {}
    results.forEach(function(r, i) {
      counts[statuses[i]] = r.count || 0
    })
    return apiResponse(null, counts)
  } catch (err) {
    return apiResponse(err, {})
  }
}

async function getCustomerGrowth(from,to){
  try{
    var {data,error}=await supabase.from('customers').select('created_at').gte('created_at',from||new Date(Date.now()-30*86400000).toISOString()).lte('created_at',to||new Date().toISOString()).order('created_at',{ascending:true});
    if(error)return apiResponse(error,[]);
    var daily={};
    (data||[]).forEach(function(c){var day=c.created_at?.slice(0,10);if(day)daily[day]=(daily[day]||0)+1;});
    var result=Object.entries(daily).map(function(kv){return{date:kv[0],count:kv[1]}}).sort(function(a,b){return a.date.localeCompare(b.date)});
    var cum=0;
    result.forEach(function(r){cum+=r.count;r.cumulative=cum;});
    return apiResponse(null,result);
  }catch(err){return apiResponse(err,[]);}
}

async function getEventStats(type,from,to){
  try{
    var query=supabase.from('analytics_events').select('event_type',{count:'exact',head:true});
    if(type)query=query.eq('event_type',type);
    if(from)query=query.gte('created_at',from);
    if(to)query=query.lte('created_at',to);
    var {count,error}=await query;
    return apiResponse(error,{event_type:type||'all',count:count||0});
  }catch(err){return apiResponse(err,{count:0});}
}

// â”€â”€ NOTIFICATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getNotifications(filters) {
  try {
    var query = supabase.from('notifications').select('*').order('created_at', { ascending: false })
    if (filters && filters.type) query = query.eq('type', filters.type)
    if (filters && filters.read === 'unread') query = query.eq('is_read', false)
    else if (filters && filters.read === 'read') query = query.eq('is_read', true)
    if (filters && filters.userId) query = query.or('for_user.eq.' + filters.userId + ',for_user.is.null')
    if (filters && filters.page && filters.pageSize) {
      var from = (filters.page - 1) * filters.pageSize
      var to = from + filters.pageSize - 1
      query = query.range(from, to)
    }
    var { data, error } = await query
    return apiResponse(error, data || [])
  } catch (err) { return apiResponse(err, []) }
}

async function markNotificationRead(id) {
  try {
    var { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function markAllNotificationsRead(userId) {
  try {
    let query = supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false)

    if (userId) {
      query = query.or(`for_user.eq.${userId},for_user.is.null`)
    }

    var { data, error } = await query
    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

function subscribeNotifications(callback) {
  return supabase
    .channel('notifications')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => callback(payload.new)
    )
    .subscribe()
}

function subscribeStats(callback) {
  return supabase
    .channel('stats-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      () => callback('orders')
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'customers' },
      () => callback('customers')
    )
    .subscribe()
}

// â”€â”€ SUPPORT TICKETS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getTickets(filters = {}) {
  try {
    let query = supabase.from('support_tickets').select('*', { count: 'exact' })

    if (filters.status) query = query.eq('status', filters.status)
    if (filters.priority) query = query.eq('priority', filters.priority)
    if (filters.assignee) query = query.eq('assigned_to', filters.assignee)

    query = query.order('updated_at', { ascending: false })

    if (filters.page && filters.pageSize) {
      var from = (filters.page - 1) * filters.pageSize
      var to = from + filters.pageSize - 1
      query = query.range(from, to)
    }

    var { data, error } = await query
    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function getTicket(id) {
  try {
    var { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', id)
      .single()

    if (ticketError) return apiResponse(ticketError)

    var { data: replies, error: replyError } = await supabase
      .from('ticket_replies')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })

    return apiResponse(replyError, { ...ticket, replies: replies || [] })
  } catch (err) {
    return apiResponse(err)
  }
}

async function createTicket(data) {
  try {
    var { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        subject: data.subject,
        description: data.description,
        customer_id: data.customer_id,
        priority: data.priority || 'medium',
        status: 'open',
      })
      .select()
      .single()

    return apiResponse(error, ticket)
  } catch (err) {
    return apiResponse(err)
  }
}

async function updateTicket(id, data) {
  try {
    var updateFields = {}
    var allowed = ['status', 'priority', 'assigned_to', 'subject', 'description']
    allowed.forEach(f => {
      if (data[f] !== undefined) updateFields[f] = data[f]
    })
    updateFields.updated_at = new Date().toISOString()

    var { data: ticket, error } = await supabase
      .from('support_tickets')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, ticket)
  } catch (err) {
    return apiResponse(err)
  }
}

async function addTicketReply(ticketId, senderType, senderName, message) {
  try {
    var { data: reply, error: replyError } = await supabase
      .from('ticket_replies')
      .insert({
        ticket_id: ticketId,
        sender_type: senderType,
        sender_name: senderName,
        message,
      })
      .select()
      .single()

    if (replyError) return apiResponse(replyError)

    await supabase
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticketId)

    return apiResponse(null, reply)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ MEDIA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function uploadFile(bucket, file, path) {
  try {
    var filePath = path || `${Date.now()}_${file.name}`

    var { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      })

    if (error) return apiResponse(error)

    var { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)

    return apiResponse(null, { path: filePath, publicUrl })
  } catch (err) {
    return apiResponse(err)
  }
}

async function deleteFile(bucket, path) {
  try {
    var { data, error } = await supabase.storage
      .from(bucket)
      .remove([path])

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

async function getFiles(bucket) {
  try {
    var { data, error } = await supabase.storage
      .from(bucket)
      .list()

    if (error) return apiResponse(error, [])

    var files = (data || []).map(file => {
      var { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(file.name)

      return {
        ...file,
        publicUrl,
      }
    })

    return apiResponse(null, files)
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function uploadProductImage(file, productId){
  try{
    var ext=file.name.split('.').pop();
    var path='products/'+productId+'/'+Date.now()+'.'+ext;
    var r=await uploadFile('media',file,path);
    if(r.error)return r;
    return apiResponse(null, r.data.publicUrl);
  }catch(err){return apiResponse(err)}
}

// â”€â”€ SETTINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getSettings() {
  try {
    var { data, error } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .single()

    return apiResponse(error, data || null)
  } catch (err) {
    return apiResponse(err)
  }
}

async function updateSettings(data) {
  try {
    var { data: existing } = await supabase
      .from('settings')
      .select('id')
      .limit(1)
      .single()

    var payload = {
      ...data,
      updated_at: new Date().toISOString(),
    }

    let result
    if (existing?.id) {
      result = await supabase
        .from('settings')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('settings')
        .insert(payload)
        .select()
        .single()
    }

    return apiResponse(result.error, result.data)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ ACTIVITY LOGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getActivityLogs(filters = {}) {
  try {
    let query = supabase.from('activity_logs').select('*', { count: 'exact' })

    if (filters.actorType) query = query.eq('actor_type', filters.actorType)
    if (filters.actorId) query = query.eq('actor_id', filters.actorId)
    if (filters.action) query = query.eq('action', filters.action)
    if (filters.resourceType) query = query.eq('resource_type', filters.resourceType)

    query = query.order('created_at', { ascending: false })

    if (filters.page && filters.pageSize) {
      var from = (filters.page - 1) * filters.pageSize
      var to = from + filters.pageSize - 1
      query = query.range(from, to)
    }

    var { data, error } = await query
    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function logActivity(actorType, actorId, action, resourceType, resourceId, details) {
  try {
    var { data, error } = await supabase
      .from('activity_logs')
      .insert({
        actor_type: actorType,
        actor_id: actorId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: details || null,
      })
      .select()
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ COUPONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getCoupons(filters = {}) {
  try {
    let query = supabase.from('coupons').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (filters.page && filters.pageSize) {
      var from = (filters.page - 1) * filters.pageSize
      var to = from + filters.pageSize - 1
      query = query.range(from, to)
    }
    var { data, error } = await query
    return apiResponse(error, data || [])
  } catch (err) {
    return apiResponse(err, [])
  }
}

async function createCoupon(data) {
  try {
    var { data: coupon, error } = await supabase
      .from('coupons')
      .insert({
        code: data.code,
        discount_type: data.discount_type || 'percentage',
        discount_value: data.discount_value,
        max_uses: data.max_uses || null,
        used_count: 0,
        expires_at: data.expires_at || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
      })
      .select()
      .single()

    return apiResponse(error, coupon)
  } catch (err) {
    return apiResponse(err)
  }
}

async function updateCoupon(id, data) {
  try {
    var updateFields = {}
    var allowed = ['code', 'discount_type', 'discount_value', 'max_uses', 'expires_at', 'is_active']
    allowed.forEach(f => {
      if (data[f] !== undefined) updateFields[f] = data[f]
    })
    updateFields.updated_at = new Date().toISOString()

    var { data: coupon, error } = await supabase
      .from('coupons')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, coupon)
  } catch (err) {
    return apiResponse(err)
  }
}

async function deleteCoupon(id) {
  try {
    var { data, error } = await supabase
      .from('coupons')
      .delete()
      .eq('id', id)
      .select()
      .single()

    return apiResponse(error, data)
  } catch (err) {
    return apiResponse(err)
  }
}

// â”€â”€ REALTIME SUBSCRIPTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function subscribeToOrders(callback) {
  return supabase
    .channel('orders')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      (payload) => callback(payload)
    )
    .subscribe()
}

function subscribeToEvents(callback) {
  return supabase
    .channel('analytics_events')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'analytics_events' },
      (payload) => callback(payload)
    )
    .subscribe()
}

// â”€â”€ AUTO-REFRESH SESSION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let refreshInterval = null

function startSessionRefresh() {
  if (refreshInterval) clearInterval(refreshInterval)
  refreshInterval = setInterval(async () => {
    try {
      var { data: { session }, error } = await supabase.auth.getSession()
      if (error || !session) return

      var expiresAt = session.expires_at ? session.expires_at * 1000 : 0
      var timeLeft = expiresAt - Date.now()

      if (timeLeft > 0 && timeLeft < 5 * 60 * 1000) {
        var { error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError) console.error('Session refresh failed:', refreshError)
      }
    } catch (err) {
      console.error('Session refresh check error:', err)
    }
  }, 10 * 60 * 1000)
}

// â”€â”€ EXPORT TO WINDOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.supabase = supabase
window.signIn = signIn
window.signOut = signOut
window.getSession = getSession
window.getCurrentUser = getCurrentUser
window.onAuthChange = onAuthChange
window.getProfiles = getProfiles

window.getOrders = getOrders
window.getOrder = getOrder
window.createOrder = createOrder
window.updateOrder = updateOrder
window.deleteOrder = deleteOrder
window.approveOrder = approveOrder
window.rejectOrder = rejectOrder

window.getOrderTimeline = getOrderTimeline
window.addTimelineEntry = addTimelineEntry

window.getCustomers = getCustomers
window.getCustomer = getCustomer
window.createCustomer = createCustomer
window.updateCustomer = updateCustomer
window.deleteCustomer = deleteCustomer

window.getProducts = getProducts
window.getProduct = getProduct
window.createProduct = createProduct
window.updateProduct = updateProduct
window.deleteProduct = deleteProduct

window.getReviews = getReviews
window.createReview = createReview
window.updateReview = updateReview
window.deleteReview = deleteReview
window.approveReview = approveReview
window.pinReview = pinReview

window.getFaqs = getFaqs
window.createFaq = createFaq
window.updateFaq = updateFaq
window.deleteFaq = deleteFaq
window.reorderFaq = reorderFaq

window.getLandingContent = getLandingContent
window.updateLandingContent = updateLandingContent

window.getDashboardStats = getDashboardStats
window.getMonthlyRevenue = getMonthlyRevenue
window.getTopProducts = getTopProducts
window.getRecentOrders = getRecentOrders
window.getAnalyticsEvents = getAnalyticsEvents
window.getSalesTrend = getSalesTrend
window.getOrderStatusDistribution = getOrderStatusDistribution
window.getCustomerGrowth = getCustomerGrowth
window.getEventStats = getEventStats

window.getNotifications = getNotifications
window.markNotificationRead = markNotificationRead
window.markAllNotificationsRead = markAllNotificationsRead
window.subscribeNotifications = subscribeNotifications

window.getTickets = getTickets
window.getTicket = getTicket
window.createTicket = createTicket
window.updateTicket = updateTicket
window.addTicketReply = addTicketReply

window.uploadFile = uploadFile
window.deleteFile = deleteFile
window.getFiles = getFiles
window.uploadProductImage = uploadProductImage
window.uploadMedia = uploadFile
window.deleteMedia = deleteFile
window.getMedia = getFiles
window.getActivities = getActivityLogs

window.getSettings = getSettings
window.updateSettings = updateSettings

window.getActivityLogs = getActivityLogs
window.logActivity = logActivity

window.getCoupons = getCoupons
window.createCoupon = createCoupon
window.updateCoupon = updateCoupon
window.deleteCoupon = deleteCoupon

window.subscribeToOrders = subscribeToOrders
window.subscribeToEvents = subscribeToEvents

window.startSessionRefresh = startSessionRefresh
window.generateOrderNumber = generateOrderNumber
window.subscribeStats = subscribeStats
window.getDashboardStatsYesterday = getDashboardStatsYesterday

startSessionRefresh()
