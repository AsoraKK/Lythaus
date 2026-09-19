import copy
import unittest
from wp007n_final_receipts import validate_regressions


def fixture():
    required=('authenticity-full','typecheck-native','validate-native-scope','validate-workflow-action-pins','python-N','independent-known-answers','test_wp007e_policies.py','test_wp007m_probe.py','diff-check','node-syntax')
    commands={name:{'exitCode':0} for name in required}
    commands['authenticity-full']['counts']=['# tests 388','# pass 388','# fail 0','# skipped 0']
    for name in ('test-native-architecture','validate-no-retired-provider-dependencies'):
        commands[name]={'exitCode':1,'counts':['# tests 256','# pass 255','# fail 1','# skipped 0'] if name=='test-native-architecture' else [],'failures':['known-parent-failure']}
        commands['parent-'+name]=copy.deepcopy(commands[name])
    return {'status':'COMPLETED_WITH_EXPLICIT_RESULTS','commands':commands,'AST':{'pass':True},'JSON':{'pass':True},'privacySecrets':{'pass':True}}


class ReceiptTests(unittest.TestCase):
    def test_complete_with_exact_inherited_failures(self):
        validate_regressions(fixture())

    def test_missing_dependencies_cannot_pass_receipt(self):
        checks=fixture();checks['commands']['typecheck-native']['exitCode']=1
        with self.assertRaisesRegex(ValueError,'REQUIRED_REGRESSION_FAILED'):validate_regressions(checks)

    def test_reduced_architecture_coverage_is_not_inherited_success(self):
        checks=fixture()
        for name in ('test-native-architecture','parent-test-native-architecture'):
            checks['commands'][name]['counts']=['# tests 220','# pass 213','# fail 7','# skipped 0']
        with self.assertRaisesRegex(ValueError,'ARCHITECTURE_COVERAGE_CHANGED'):validate_regressions(checks)


if __name__=='__main__':unittest.main()
