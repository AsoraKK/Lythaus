import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import AuthenticityBeta from './AuthenticityBeta.jsx';
import { adminRequest } from '../api/adminApi.js';
vi.mock('../api/adminApi.js',()=>({adminRequest:vi.fn()}));
beforeEach(()=>adminRequest.mockReset());
it('opens private evidence and records a non-enforcing review without interpreting feedback as markup',async()=>{
  const item={caseId:'fixture-case',status:'inconclusive',reviewState:'requested',advisoryStatus:'not_requested',explanation:'Authorship remains unresolved.',limitations:['Experimental evidence only.'],diagnostics:{safe:{status:'OK'}},feedback:[{id:'feedback',kind:'feedback',message:'<script>publish()</script>'}]};
  adminRequest.mockImplementation(async path=>path==='authenticity/cases'?{items:[item]}:item);
  render(<AuthenticityBeta/>);
  fireEvent.click(await screen.findByRole('button',{name:'Open fixture-case'}));
  expect(await screen.findByText('Authorship remains unresolved.')).toBeInTheDocument();
  expect(screen.getByText('feedback: <script>publish()</script>')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.change(screen.getByLabelText('Versioned review explanation'),{target:{value:'Evidence remains inconclusive.'}});
  fireEvent.click(screen.getByRole('button',{name:'Record private review'}));
  await waitFor(()=>expect(adminRequest).toHaveBeenCalledWith('authenticity/cases/fixture-case/review',{method:'POST',body:{message:'Evidence remains inconclusive.'}}));
  expect(screen.queryByRole('button',{name:/publish|reward|certify/i})).not.toBeInTheDocument();
});
